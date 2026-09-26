#!/usr/bin/env bash
#
# One command, from an empty Google Cloud project to a running service.
#
#   bash scripts/go-live.sh
#
# gcloud only. No Terraform, no state file, no third-party tool: everything
# here is the Google CLI that Cloud Shell already has, so there is nothing new
# to install, license or trust.
#
# What that costs, stated plainly rather than discovered later: there is no
# declarative state, so nothing computes a diff, warns about drift, or tears the
# estate down in one command. Each step therefore checks whether its resource
# already exists and skips it if so — which makes this safe to run again after
# any failure, resuming at the first thing that is missing. Nothing is deleted.
# scripts/teardown.sh removes what this created, in dependency order.
#
# No gcloud call relies on ambient configuration: --project is passed every
# time, and every path is absolute. A Cloud Shell reset cannot break a run.
#
set -euo pipefail

PROJECT="${PROJECT:-congo-voice}"
REGION="${REGION:-africa-south1}"
DOMAIN="${DOMAIN:-congovoicecd.com}"
export ENVIRONMENT="${ENVIRONMENT:-pilot}"

NAME="congovoice-${ENVIRONMENT}"
NETWORK="${NAME}-net"
PEERING_RANGE="${NAME}-private-ip"
DB_INSTANCE="${NAME}-pg"
DB_NAME=cvos
DB_USER=cvos_app
DB_TIER="${DB_TIER:-db-custom-2-7680}"
export MEDIA_BUCKET="${NAME}-media"
SERVICE_ACCOUNT_ID="${NAME}-app"
SERVICE="$NAME"
SCHEDULER_JOB="${NAME}-workflow"
REPO=cvos
DB_PASSWORD_SECRET="cvos-${ENVIRONMENT}-db-password"
DB_CA_SECRET="${NAME}-db_ca"
# Cloud Run mounts a secret as a file here, so the container can verify the
# database's certificate instead of being told not to bother.
DB_CA_PATH="/etc/ssl/cloudsql/server-ca.pem"
export PUBLIC_URL="https://${DOMAIN}"
MEDIA_BACKSTOP_DAYS="${MEDIA_BACKSTOP_DAYS:-400}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export SA_EMAIL="${SERVICE_ACCOUNT_ID}@${PROJECT}.iam.gserviceaccount.com"
IMAGE_PATH="${REGION}-docker.pkg.dev/${PROJECT}/${REPO}/app"

# Env var name → secret name. The application reads the former; Secret Manager
# holds the latter. Cloud Run refuses to start if any of these has no version.
SECRET_KEYS=(session_secret data_encryption_key database_url cron_secret
             anthropic_api_key gemini_api_key openai_api_key)

step() { printf '\n\033[1m── %s\033[0m\n' "$*"; }
note() { printf '   %s\n' "$*"; }
die()  { printf '\n\033[31mSTOPPED: %s\033[0m\n' "$*" >&2; exit 1; }
gc()   { gcloud "$@" --project="$PROJECT"; }
exists() { "$@" >/dev/null 2>&1; }

# ── 0. The machine and the project ───────────────────────────────────────────

step "Checking the project"
command -v gcloud >/dev/null || die "gcloud is not installed."
gcloud projects describe "$PROJECT" --format='value(projectId)' >/dev/null \
  || die "Project '$PROJECT' does not exist or this account cannot see it. Run: gcloud projects list"
[[ "$(gcloud billing projects describe "$PROJECT" --format='value(billingEnabled)')" == "True" ]] \
  || die "Billing is not enabled on '$PROJECT'. Link an account at https://console.cloud.google.com/billing, then run this again."
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
note "$PROJECT ($PROJECT_NUMBER) · $REGION · $DOMAIN · stage $ENVIRONMENT"

# ── 1. APIs ──────────────────────────────────────────────────────────────────

step "APIs"
enabled=$(gc services list --enabled --format='value(config.name)')
for api in run sqladmin secretmanager cloudscheduler artifactregistry \
           servicenetworking compute dns iam cloudbuild storage; do
  if grep -qx "${api}.googleapis.com" <<<"$enabled"; then
    note "on: $api"
  else
    gc services enable "${api}.googleapis.com" && note "enabled: $api"
  fi
done

# ── 2. The image registry ────────────────────────────────────────────────────

step "Image registry"
if exists gc artifacts repositories describe "$REPO" --location="$REGION"; then
  note "exists: $IMAGE_PATH"
else
  gc artifacts repositories create "$REPO" --location="$REGION" \
    --repository-format=docker --description="CONGO VOICE AI OS container images."
  note "created: $IMAGE_PATH"
fi

step "Cloud Build permissions"
# A new project runs Cloud Build as the Compute Engine default account, which
# can push nowhere and write no logs until it is told it may.
CB_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
for role in artifactregistry.writer logging.logWriter; do
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:${CB_SA}" --role="roles/${role}" \
    --condition=None >/dev/null && note "roles/${role}"
done

# ── 3. The image ─────────────────────────────────────────────────────────────

step "Image (3 to 15 minutes on a first build)"
cd "$REPO_ROOT"
TAG=$(git rev-parse --short HEAD)
if exists gc artifacts docker images describe "${IMAGE_PATH}:${TAG}"; then
  note "already built for $TAG; not rebuilding"
else
  # The public origin is inlined into the browser bundle, so it is a build
  # argument, not a runtime variable. An image built without it is silently wrong.
  gc builds submit --config cloudbuild.yaml \
    --substitutions="_REGION=${REGION},_SITE_URL=${PUBLIC_URL},_TAG=${TAG}"
fi
DIGEST=$(gc artifacts docker images describe "${IMAGE_PATH}:${TAG}" \
  --format='value(image_summary.digest)')
[[ "$DIGEST" == sha256:* ]] || die "Could not read the digest for tag $TAG."
# By digest, never by tag: a tag can be moved under a running service.
IMAGE="${IMAGE_PATH}@${DIGEST}"
note "$DIGEST"

# ── 4. Network: the database is never reachable from the internet ────────────

step "Private network"
if exists gc compute networks describe "$NETWORK"; then
  note "exists: $NETWORK"
else
  gc compute networks create "$NETWORK" --subnet-mode=auto >/dev/null
  note "created: $NETWORK"
fi

if exists gc compute addresses describe "$PEERING_RANGE" --global; then
  note "exists: $PEERING_RANGE"
else
  gc compute addresses create "$PEERING_RANGE" --global \
    --purpose=VPC_PEERING --prefix-length=16 --network="$NETWORK" >/dev/null
  note "created: $PEERING_RANGE"
fi

if gc services vpc-peerings list --network="$NETWORK" \
     --format='value(reservedPeeringRanges)' 2>/dev/null | grep -q "$PEERING_RANGE"; then
  note "peering already connected"
else
  gc services vpc-peerings connect --service=servicenetworking.googleapis.com \
    --network="$NETWORK" --ranges="$PEERING_RANGE" >/dev/null
  note "peering connected"
fi

# ── 5. The database ──────────────────────────────────────────────────────────

step "Database password"
if exists gc secrets describe "$DB_PASSWORD_SECRET"; then
  note "already in Secret Manager: $DB_PASSWORD_SECRET"
else
  openssl rand -base64 32 | tr -d '\n' \
    | gc secrets create "$DB_PASSWORD_SECRET" --data-file=- --replication-policy=automatic
  note "generated: $DB_PASSWORD_SECRET"
fi
DB_PASSWORD="$(gc secrets versions access latest --secret="$DB_PASSWORD_SECRET")"
[[ -n "$DB_PASSWORD" ]] || die "Could not read $DB_PASSWORD_SECRET."

step "PostgreSQL (10 to 20 minutes on a first run — this is the slow one)"
if exists gc sql instances describe "$DB_INSTANCE"; then
  note "exists: $DB_INSTANCE"
else
  # --edition=enterprise is stated, not defaulted: some regions now create a new
  # instance as ENTERPRISE_PLUS, which accepts only db-perf-optimized-* tiers
  # and rejects db-custom-* with a 400.
  #
  # --ssl-mode=ENCRYPTED_ONLY, not TRUSTED_CLIENT_CERTIFICATE_REQUIRED: the
  # application connects with sslmode=require, which encrypts but presents no
  # client certificate. Requiring one would refuse every connection it makes.
  gc sql instances create "$DB_INSTANCE" \
    --database-version=POSTGRES_16 \
    --region="$REGION" \
    --edition=enterprise \
    --tier="$DB_TIER" \
    --network="projects/${PROJECT}/global/networks/${NETWORK}" \
    --no-assign-ip \
    --availability-type=zonal \
    --storage-auto-increase \
    --backup-start-time=02:00 \
    --enable-point-in-time-recovery \
    --retained-backups-count=30 \
    --retained-transaction-log-days=7 \
    --database-flags=log_min_duration_statement=1000 \
    --ssl-mode=ENCRYPTED_ONLY \
    --deletion-protection
  note "created: $DB_INSTANCE"
fi
DB_IP=$(gc sql instances describe "$DB_INSTANCE" --format='value(ipAddresses[0].ipAddress)')
[[ -n "$DB_IP" ]] || die "The database has no private address."
note "private address: $DB_IP"

# Cloud SQL signs its server certificate with a per-instance CA that nothing
# else has a reason to trust, and node-postgres 8.23 verifies the chain for
# sslmode=require where libpq only encrypted. Without the CA in the container
# the connection fails with UNABLE_TO_VERIFY_LEAF_SIGNATURE — so store it and
# mount it, rather than switching verification off.
DB_CA=$(gc sql instances describe "$DB_INSTANCE" --format='value(serverCaCert.cert)')
[[ "$DB_CA" == *"BEGIN CERTIFICATE"* ]] || die "Could not read the server CA for $DB_INSTANCE."
if ! exists gc secrets describe "$DB_CA_SECRET"; then
  gc secrets create "$DB_CA_SECRET" --replication-policy=automatic >/dev/null
fi
# The CA is rotatable, so compare rather than assume: a stale copy fails exactly
# the same way a missing one does.
if [[ "$(gc secrets versions access latest --secret="$DB_CA_SECRET" 2>/dev/null || true)" == "$DB_CA" ]]; then
  note "server CA already stored"
else
  printf '%s' "$DB_CA" | gc secrets versions add "$DB_CA_SECRET" --data-file=- >/dev/null
  note "server CA stored in $DB_CA_SECRET"
fi
gc secrets add-iam-policy-binding "$DB_CA_SECRET" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role=roles/secretmanager.secretAccessor >/dev/null 2>&1 || true

# uselibpqcompat=true with verify-ca and a CA file: the chain is verified, the
# hostname is not — correct here, because the certificate names the instance and
# we connect to its private address.
DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_IP}:5432/${DB_NAME}?uselibpqcompat=true&sslmode=verify-ca&sslrootcert=${DB_CA_PATH}"

if exists gc sql databases describe "$DB_NAME" --instance="$DB_INSTANCE"; then
  note "exists: database $DB_NAME"
else
  gc sql databases create "$DB_NAME" --instance="$DB_INSTANCE" >/dev/null
  note "created: database $DB_NAME"
fi

if gc sql users list --instance="$DB_INSTANCE" --format='value(name)' | grep -qx "$DB_USER"; then
  note "exists: user $DB_USER"
else
  gc sql users create "$DB_USER" --instance="$DB_INSTANCE" --password="$DB_PASSWORD" >/dev/null
  note "created: user $DB_USER"
fi

# ── 6. Media, and who may touch it ───────────────────────────────────────────

step "Media bucket"
if exists gc storage buckets describe "gs://${MEDIA_BUCKET}"; then
  note "exists: gs://${MEDIA_BUCKET}"
else
  gc storage buckets create "gs://${MEDIA_BUCKET}" --location="$REGION" \
    --uniform-bucket-level-access --public-access-prevention >/dev/null
  gc storage buckets update "gs://${MEDIA_BUCKET}" --versioning >/dev/null
  # A backstop only. The application deletes on its own retention schedule and
  # audits each deletion; this catches anything it never learned about.
  lifecycle=$(mktemp)
  cat > "$lifecycle" <<JSON
{"rule":[{"action":{"type":"Delete"},"condition":{"age":${MEDIA_BACKSTOP_DAYS}}}]}
JSON
  gc storage buckets update "gs://${MEDIA_BUCKET}" --lifecycle-file="$lifecycle" >/dev/null
  rm -f "$lifecycle"
  note "created: gs://${MEDIA_BUCKET} (private, versioned, ${MEDIA_BACKSTOP_DAYS}-day backstop)"
fi

step "Service identity"
if exists gc iam service-accounts describe "$SA_EMAIL"; then
  note "exists: $SA_EMAIL"
else
  gc iam service-accounts create "$SERVICE_ACCOUNT_ID" \
    --display-name="CONGO VOICE AI OS (${ENVIRONMENT})" >/dev/null
  note "created: $SA_EMAIL"
fi
gc storage buckets add-iam-policy-binding "gs://${MEDIA_BUCKET}" \
  --member="serviceAccount:${SA_EMAIL}" --role=roles/storage.objectAdmin >/dev/null
note "granted: objectAdmin on the media bucket"
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:${SA_EMAIL}" --role=roles/cloudsql.client \
  --condition=None >/dev/null
note "granted: cloudsql.client"

# ── 7. Secrets ───────────────────────────────────────────────────────────────
#
# Containers are created here; values are written by a person, or generated. A
# vendor key nobody has supplied gets a blank version: Cloud Run refuses to
# start a service mounting a secret with no version at all, and the gateway
# reads a blank credential as "not configured", staying on the offline provider
# rather than registering a vendor whose every call would fail with a 401.

step "Secrets"
add_version() { printf '%s' "$2" | gc secrets versions add "$1" --data-file=- >/dev/null; }
add_blank_version() {
  # Secret Manager refuses a zero-byte payload in some API versions. A single
  # space is accepted everywhere and the gateway trims it, so it reaches the
  # application as "not configured" either way.
  add_version "$1" "" 2>/dev/null || add_version "$1" " "
}

for key in "${SECRET_KEYS[@]}"; do
  secret="${NAME}-${key}"
  if ! exists gc secrets describe "$secret"; then
    gc secrets create "$secret" --replication-policy=automatic >/dev/null
    note "created container: $key"
  fi
  gc secrets add-iam-policy-binding "$secret" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role=roles/secretmanager.secretAccessor >/dev/null

  # DATABASE_URL is the one secret that is recomputed rather than left alone: it
  # encodes the address, the password and the TLS settings, and a stale value is
  # the difference between a service that starts and one that does not.
  if [[ "$key" == database_url ]]; then
    if [[ "$(gc secrets versions access latest --secret="$secret" 2>/dev/null || true)" == "$DATABASE_URL" ]]; then
      note "already correct: $key"
    else
      add_version "$secret" "$DATABASE_URL"
      note "composed: $key (verify-ca against the instance CA)"
    fi
    continue
  fi

  if [[ -n "$(gc secrets versions list "$secret" --filter='state=enabled' --format='value(name)' --limit=1)" ]]; then
    note "already set: $key"
    continue
  fi
  case "$key" in
    session_secret|data_encryption_key|cron_secret)
      add_version "$secret" "$(openssl rand -hex 32)"; note "generated: $key" ;;
    *)
      # An exported variable wins: `export ANTHROPIC_API_KEY=...` before running
      # this loads a real key instead of a blank placeholder.
      env_name=$(tr '[:lower:]' '[:upper:]' <<<"$key")
      value="${!env_name:-}"
      if [[ -n "$value" ]]; then
        add_version "$secret" "$value"; note "loaded from \$${env_name}: $key"
      else
        add_blank_version "$secret"; note "blank, offline provider: $key"
      fi ;;
  esac
done

# ── 8. The service ───────────────────────────────────────────────────────────

step "Cloud Run service"
# Environment variables go in a file, not on the command line.
#
# --set-env-vars parses its own syntax, so any value containing the delimiter
# breaks it — and there is no safe delimiter here: CRON_SERVICE_ACCOUNT is an
# email address (@), DATA_RESIDENCY is a comma-separated list (,), and the URLs
# contain : and /. A file has no delimiter to collide with.
ENV_FILE="$(mktemp)"
trap 'rm -f "$ENV_FILE"' EXIT
python3 - "$ENV_FILE" <<'PYENV'
import json, os, sys
# JSON is a subset of YAML, which is what --env-vars-file accepts, and json.dump
# escapes every value correctly by construction.
env = {
    "NODE_ENV": "production",
    "STORAGE_DRIVER": "gcs",
    "GCS_BUCKET": os.environ["MEDIA_BUCKET"],
    "TRUSTED_PROXY_HOPS": "1",
    "NEXT_PUBLIC_SITE_URL": os.environ["PUBLIC_URL"],
    # Not a label: pilot and prod are the stages at which the platform assumes a
    # real citizen is on the other end. An escalation must be able to reach a
    # person, clinical content must carry a review-board sign-off, and a log-only
    # notification provider fails loudly instead of pretending it sent something.
    "DEPLOYMENT_STAGE": os.environ["ENVIRONMENT"],
    # Declared, never inferred from the region: the platform refuses to guess a
    # jurisdiction from a region name. See docs/DATA_RESIDENCY.md.
    "DATA_RESIDENCY": os.environ.get("DATA_RESIDENCY") or "ZA,US",
    "DEPLOYMENT_JURISDICTION": os.environ.get("DEPLOYMENT_JURISDICTION") or "ZA",
    # So the maintenance endpoint can tell the scheduler's own identity token
    # from anybody else's. Without these it refuses every scheduled run.
    "CRON_OIDC_AUDIENCE": os.environ["PUBLIC_URL"] + "/api/v1/workflow/run",
    "CRON_SERVICE_ACCOUNT": os.environ["SA_EMAIL"],
}
json.dump(env, open(sys.argv[1], "w"), indent=2)
PYENV
note "$(python3 -c 'import json,sys;print(len(json.load(open(sys.argv[1]))), "environment variables")' "$ENV_FILE")"

SECRET_REFS=""
for key in "${SECRET_KEYS[@]}"; do
  env_name=$(tr '[:lower:]' '[:upper:]' <<<"$key")
  SECRET_REFS+="${SECRET_REFS:+,}${env_name}=${NAME}-${key}:latest"
done
# A path rather than a variable name mounts the secret as a file, which is what
# sslrootcert in DATABASE_URL points at.
SECRET_REFS+=",${DB_CA_PATH}=${DB_CA_SECRET}:latest"

# --allow-unauthenticated: the service answers citizens on the open internet and
# telephony webhooks from providers holding no Google credentials. Every
# /api/v1 route still enforces its own session and permission check in handle().
#
# Never zero instances where calls are answered: a cold start on an emergency
# call is a citizen waiting.
# --startup-probe on the platform's own health endpoint rather than Cloud Run's
# default TCP check. A TCP check passes the moment the socket binds, which for a
# Next.js server is before it can serve anything, so a container that boots and
# then cannot reach its database reports healthy and fails on the first citizen.
# 60 seconds of grace: the first request applies the migrations.
if ! gc run deploy "$SERVICE" \
  --image="$IMAGE" \
  --region="$REGION" \
  --service-account="$SA_EMAIL" \
  --network="$NETWORK" \
  --subnet="$NETWORK" \
  --vpc-egress=private-ranges-only \
  --port=8080 \
  --cpu=1 --memory=1Gi \
  --min-instances="${MIN_INSTANCES:-1}" \
  --max-instances="${MAX_INSTANCES:-10}" \
  --allow-unauthenticated \
  --env-vars-file="$ENV_FILE" \
  --set-secrets="$SECRET_REFS" \
  --startup-probe="httpGet.path=/api/v1/system/health,initialDelaySeconds=10,timeoutSeconds=5,periodSeconds=10,failureThreshold=6" \
  --quiet
then
  # A failed revision says "check the logs" and gives a console URL. Print them
  # here instead: the reason is usually one line, and a round trip to a browser
  # to read it is a round trip that did not have to happen.
  printf '\n'
  note "The revision did not start. Its own output follows."
  printf '\n'
  gc logging read \
    "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${SERVICE}\" AND severity>=DEFAULT" \
    --freshness=15m --limit=60 --order=asc \
    --format='value(timestamp.date("%H:%M:%S"),severity,textPayload,jsonPayload.message,jsonPayload.error)' \
    | sed 's/^/   /' || note "(could not read the logs; see the console URL above)"
  die "The container failed to start. The lines above are its reason."
fi
SERVICE_URL=$(gc run services describe "$SERVICE" --region="$REGION" --format='value(status.url)')
note "answering at $SERVICE_URL"

step "Scheduled work"
SCHED_OK=yes
if exists gc scheduler jobs describe "$SCHEDULER_JOB" --location="$REGION"; then
  note "exists: $SCHEDULER_JOB"
else
  # A run that overlaps the next is worse than one that is skipped: every step
  # is independent and idempotent, but two sweeps at once double the work.
  gc scheduler jobs create http "$SCHEDULER_JOB" \
    --location="$REGION" \
    --schedule="*/5 * * * *" \
    --time-zone="Africa/Kinshasa" \
    --uri="${PUBLIC_URL}/api/v1/workflow/run" \
    --http-method=POST \
    --headers="Content-Type=application/json" \
    --oidc-service-account-email="$SA_EMAIL" \
    --oidc-token-audience="${PUBLIC_URL}/api/v1/workflow/run" \
    --attempt-deadline=320s \
    --max-retry-attempts=1 >/dev/null \
  && note "created: $SCHEDULER_JOB (every 5 minutes, Africa/Kinshasa)" \
  || { SCHED_OK=no; note "Cloud Scheduler refused this region. Reminders, the SLA sweep and retention will not run until this is solved."; }
fi

# ── 9. The domain, which is allowed to fail ──────────────────────────────────
#
# Cloud Run domain mappings are not offered in every region, and a region that
# does not offer them refuses the mapping, not the service. Attempting it last
# and separately means an unsupported region costs a warning, not the run.

step "Domain mapping for $DOMAIN"
DOMAIN_OK=yes
if exists gc beta run domain-mappings describe --domain="$DOMAIN" --region="$REGION"; then
  note "already mapped"
elif gc beta run domain-mappings create --service="$SERVICE" --domain="$DOMAIN" \
       --region="$REGION" >/dev/null 2>&1; then
  note "created"
else
  DOMAIN_OK=no
  note "not available here. Everything else is up."
fi

# ── Done ─────────────────────────────────────────────────────────────────────

step "Done"
printf '\n'
note "The platform answers at: $SERVICE_URL"
printf '\n'
if [[ "$DOMAIN_OK" == yes ]]; then
  note "DNS records to add at your registrar for ${DOMAIN}:"
  gc beta run domain-mappings describe --domain="$DOMAIN" --region="$REGION" \
    --format='value(status.resourceRecords.flatten())' | sed 's/^/     /'
  printf '\n'
  note "Then, once they resolve and the managed certificate is issued:"
  note "  curl -sI ${PUBLIC_URL} | head -3"
  note "  npm run preflight -- ${PUBLIC_URL}"
else
  note "${DOMAIN} is NOT mapped. The service is reachable on its run.app URL,"
  note "which is enough to test but not to launch on: the telephony provider"
  note "signs each webhook over the full URL it called, and this image was"
  note "built believing it lives at ${PUBLIC_URL}."
  printf '\n'
  note "Two ways forward — docs/GO_LIVE.md §4:"
  note "  a) A global external Application Load Balancer in front of the"
  note "     service, with a Google-managed certificate. Works in every"
  note "     region, and is the answer for a .cd domain."
  note "  b) A region that offers mappings — with the latency and the"
  note "     residency change in docs/DATA_RESIDENCY.md written down first."
fi
if [[ "$SCHED_OK" != yes ]]; then
  printf '\n'
  note "Cloud Scheduler did not accept ${REGION}. Until it is running, nothing"
  note "sweeps SLAs, sends reminders or applies retention. Create the job in a"
  note "region that supports it — it calls the platform over HTTPS, so it does"
  note "not have to sit in the same region as the service."
fi
printf '\n'
note "Do NOT run 'npm run seed' against this database — it is synthetic"
note "demonstration data in five languages, and it refuses to run in"
note "production. Create the real accounts in /admin/utilisateurs, each with"
note "a PIN that is not 1234."
printf '\n'
