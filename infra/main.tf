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

# ── Network: the database is never reachable from the internet ────────────────

resource "google_compute_network" "main" {
  name                    = "${local.name}-net"
  auto_create_subnetworks = true
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

# ── Scheduled work ───────────────────────────────────────────────────────────

resource "google_cloud_scheduler_job" "workflow" {
  name        = "${local.name}-workflow"
  description = "Reminders, SLA sweep, retention, quality review and report jobs."
  schedule    = "*/5 * * * *"
  time_zone   = "Africa/Kinshasa"

  http_target {
    http_method = "POST"
    uri         = "${var.public_url}/api/v1/workflow/run"
    headers = {
      "Content-Type" = "application/json"
    }
    oidc_token {
      service_account_email = google_service_account.app.email
    }
  }
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
