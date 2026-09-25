# CONGO VOICE AI OS — the baseline a pilot province runs on (DO-02).
#
# One Cloud Run service, one PostgreSQL instance it reaches over a private
# address, one bucket for recordings, and the secrets it needs by reference
# rather than by value. Scheduled work is a Cloud Scheduler job hitting the
# platform's own endpoint, so the schedule lives with the infrastructure and the
# logic lives with the application.

terraform {
  required_version = ">= 1.6"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }

  /*
   * State lives in a bucket, not on the machine you happened to run from.
   *
   * Two reasons, both of which have ended badly for someone. A local state file
   * on a Cloud Shell VM is gone when the VM is recycled, and state that is gone
   * means every resource below is orphaned: still running, still billing, and no
   * longer managed by anything. And a state file contains the database password
   * in clear, so it must never sit in a working copy where it can be committed.
   *
   * The bucket is supplied at init time because a backend cannot read variables:
   *
   *   gcloud storage buckets create gs://<project>-tfstate --location=africa-south1    *     --uniform-bucket-level-access --public-access-prevention
   *   gcloud storage buckets update gs://<project>-tfstate --versioning
   *   terraform init -backend-config="bucket=<project>-tfstate"
   */
  backend "gcs" {
    prefix = "cvos"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

locals {
  name = "congovoice-${var.environment}"
  # Recordings and photographs are citizen data: the bucket is private, versioned
  # and lifecycle-bounded even though the application deletes on its own schedule.
  media_bucket = "${local.name}-media"
}

# ── The APIs this needs, enabled before anything asks for them ───────────────
#
# Terraform will otherwise fail partway through a first apply with an error
# naming a service nobody has turned on, leaving half the estate created.

resource "google_project_service" "required" {
  for_each = toset([
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "secretmanager.googleapis.com",
    "cloudscheduler.googleapis.com",
    "artifactregistry.googleapis.com",
    "servicenetworking.googleapis.com",
    "compute.googleapis.com",
    "dns.googleapis.com",
    "iam.googleapis.com",
  ])
  project = var.project_id
  service = each.key
  # Turning an API off because Terraform was destroyed would break anything
  # else in the project that also uses it.
  disable_on_destroy = false
}

# ── Where the image lives ────────────────────────────────────────────────────

resource "google_artifact_registry_repository" "app" {
  location      = var.region
  repository_id = "cvos"
  format        = "DOCKER"
  description   = "CONGO VOICE AI OS container images."
  depends_on    = [google_project_service.required]

  docker_config {
    immutable_tags = false
  }
}

# ── Network: the database is never reachable from the internet ────────────────

resource "google_compute_network" "main" {
  name                    = "${local.name}-net"
  auto_create_subnetworks = true
  depends_on              = [google_project_service.required]
}

resource "google_compute_global_address" "private_ip" {
  name          = "${local.name}-private-ip"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.main.id
}

resource "google_service_networking_connection" "private_vpc" {
  network                 = google_compute_network.main.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip.name]
}

# ── Database ─────────────────────────────────────────────────────────────────

resource "google_sql_database_instance" "main" {
  name                = "${local.name}-pg"
  database_version    = "POSTGRES_16"
  region              = var.region
  deletion_protection = true
  depends_on          = [google_service_networking_connection.private_vpc]

  settings {
    tier              = var.db_tier
    availability_type = var.environment == "prod" ? "REGIONAL" : "ZONAL"
    disk_autoresize   = true

    backup_configuration {
      enabled    = true
      start_time = "02:00"
      # Point-in-time recovery is what makes the recovery point objective real.
      point_in_time_recovery_enabled = true
      transaction_log_retention_days = 7
      backup_retention_settings {
        retained_backups = 30
      }
    }

    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.main.id
      require_ssl     = true
    }

    database_flags {
      name  = "log_min_duration_statement"
      value = "1000"
    }
  }
}

resource "google_sql_database" "app" {
  name     = "cvos"
  instance = google_sql_database_instance.main.name
}

resource "google_sql_user" "app" {
  name     = "cvos_app"
  instance = google_sql_database_instance.main.name
  password = var.db_password
}

# ── Media ────────────────────────────────────────────────────────────────────

resource "google_storage_bucket" "media" {
  name                        = local.media_bucket
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  versioning {
    enabled = true
  }

  # A backstop only. The application deletes on its own retention schedule and
  # audits each deletion; this catches anything it never learned about.
  lifecycle_rule {
    condition {
      age = var.media_backstop_days
    }
    action {
      type = "Delete"
    }
  }
}

# ── Identity ─────────────────────────────────────────────────────────────────

resource "google_service_account" "app" {
  account_id   = "${local.name}-app"
  display_name = "CONGO VOICE AI OS (${var.environment})"
}

resource "google_storage_bucket_iam_member" "app_media" {
  bucket = google_storage_bucket.media.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.app.email}"
}

resource "google_project_iam_member" "app_sql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.app.email}"
}

# ── Secrets: containers here, values added by a person ───────────────────────

resource "google_secret_manager_secret" "app" {
  for_each  = toset(var.secret_names)
  secret_id = "${local.name}-${each.key}"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_iam_member" "app" {
  for_each  = google_secret_manager_secret.app
  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.app.email}"
}

# ── The service ──────────────────────────────────────────────────────────────

resource "google_cloud_run_v2_service" "app" {
  name     = local.name
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.app.email

    scaling {
      # Never zero: a cold start on an emergency call is a citizen waiting.
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    vpc_access {
      network_interfaces {
        network = google_compute_network.main.id
      }
      egress = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = var.image

      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "STORAGE_DRIVER"
        value = "gcs"
      }
      env {
        name  = "GCS_BUCKET"
        value = google_storage_bucket.media.name
      }
      env {
        name  = "TRUSTED_PROXY_HOPS"
        value = "1"
      }
      env {
        name  = "NEXT_PUBLIC_SITE_URL"
        value = var.public_url
      }
      # Not a label: pilot and prod are the stages at which the platform assumes
      # a real citizen is on the other end. An escalation must be able to reach
      # a person, clinical content must carry a review-board sign-off, and a
      # log-only provider fails loudly instead of pretending it sent something.
      env {
        name  = "DEPLOYMENT_STAGE"
        value = var.environment
      }
      # What this deployment may send citizen data to, and where it is. Both are
      # declared rather than inferred from the region: the platform refuses to
      # guess a jurisdiction from a region name (docs/DATA_RESIDENCY.md).
      env {
        name  = "DATA_RESIDENCY"
        value = join(",", var.data_residency)
      }
      env {
        name  = "DEPLOYMENT_JURISDICTION"
        value = var.deployment_jurisdiction
      }
      # So the maintenance endpoint can tell the scheduler's own identity token
      # from anybody else's. Without these it refuses every scheduled run.
      env {
        name  = "CRON_OIDC_AUDIENCE"
        value = "${var.public_url}/api/v1/workflow/run"
      }
      env {
        name  = "CRON_SERVICE_ACCOUNT"
        value = google_service_account.app.email
      }

      dynamic "env" {
        for_each = google_secret_manager_secret.app
        content {
          name = upper(env.key)
          value_source {
            secret_key_ref {
              secret  = env.value.secret_id
              version = "latest"
            }
          }
        }
      }

      startup_probe {
        http_get {
          path = "/api/v1/system/health"
        }
        initial_delay_seconds = 10
        timeout_seconds       = 5
        failure_threshold     = 6
      }

      liveness_probe {
        http_get {
          path = "/api/v1/system/health"
        }
        period_seconds = 30
      }
    }
  }
}

# ── Who may call it ──────────────────────────────────────────────────────────
#
# A Cloud Run v2 service requires authentication by default. This one answers
# citizens on the open internet and telephony webhooks from providers who hold
# no Google credentials, so it is public at the network edge — and every
# /api/v1 route enforces its own session and permission check in handle().

resource "google_cloud_run_v2_service_iam_member" "public" {
  project  = var.project_id
  location = google_cloud_run_v2_service.app.location
  name     = google_cloud_run_v2_service.app.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ── Scheduled work ───────────────────────────────────────────────────────────

resource "google_cloud_scheduler_job" "workflow" {
  name        = "${local.name}-workflow"
  description = "Reminders, SLA sweep, retention, quality review and report jobs."
  schedule    = "*/5 * * * *"
  time_zone   = "Africa/Kinshasa"

  # A run that overlaps the next one is worse than a run that is skipped: every
  # step is independent and idempotent, but two sweeps at once double the work.
  attempt_deadline = "320s"

  retry_config {
    retry_count = 1
  }

  http_target {
    http_method = "POST"
    uri         = "${var.public_url}/api/v1/workflow/run"
    headers = {
      "Content-Type" = "application/json"
    }
    oidc_token {
      service_account_email = google_service_account.app.email
      # Stated rather than defaulted: the token is bound to this exact endpoint,
      # and the application checks it against the same string.
      audience = "${var.public_url}/api/v1/workflow/run"
    }
  }

  depends_on = [google_project_service.required]
}

# ── The web domain ───────────────────────────────────────────────────────────
#
# Cloud Run issues and renews a managed certificate once the domain is verified
# and pointed at it, so there is no certificate resource here. What there is:
# the mapping, and — when the zone is ours — the records that make it resolve.
#
# The domain has to exist before the platform is useful, and not only for the
# look of it. `NEXT_PUBLIC_SITE_URL` is what canonical links, the sitemap, the
# social images and the IVR callback URLs are built from, and the telephony
# provider signs its webhooks over the full URL it called. A service reachable
# on one origin and told it lives on another fails signature validation on every
# inbound call, which looks like a telephony fault and is not one.

resource "google_cloud_run_domain_mapping" "app" {
  count    = var.domain == "" ? 0 : 1
  name     = var.domain
  location = var.region

  metadata {
    namespace = var.project_id
  }

  spec {
    route_name = google_cloud_run_v2_service.app.name
  }
}

# Apex records, when the zone is managed here. Cloud Run's apex mapping uses
# four A and four AAAA addresses; they are stable and documented by the product.
resource "google_dns_record_set" "apex_a" {
  count        = var.manage_dns && var.domain != "" ? 1 : 0
  name         = "${var.domain}."
  type         = "A"
  ttl          = 300
  managed_zone = var.dns_zone_name
  rrdatas      = ["216.239.32.21", "216.239.34.21", "216.239.36.21", "216.239.38.21"]
}

resource "google_dns_record_set" "apex_aaaa" {
  count        = var.manage_dns && var.domain != "" ? 1 : 0
  name         = "${var.domain}."
  type         = "AAAA"
  ttl          = 300
  managed_zone = var.dns_zone_name
  rrdatas      = ["2001:4860:4802:32::15", "2001:4860:4802:34::15", "2001:4860:4802:36::15", "2001:4860:4802:38::15"]
}

resource "google_dns_record_set" "www" {
  count        = var.manage_dns && var.domain != "" ? 1 : 0
  name         = "www.${var.domain}."
  type         = "CNAME"
  ttl          = 300
  managed_zone = var.dns_zone_name
  rrdatas      = ["ghs.googlehosted.com."]
}
