#!/usr/bin/env bash
#
# One command, from an empty Google Cloud project to a running service.
#
#   bash scripts/go-live.sh
#
# Written because doing this by hand means twenty pasted blocks into a Cloud
# Shell that resets its working directory and its `core/project` between
# commands, and a paste that drops a character fails in a way that looks like a
# different problem entirely.
#
# Every step is idempotent and checked before it runs, so this is safe to run
# again after any failure: it skips what already exists and resumes at the first
# thing that does not. Nothing is destroyed. No gcloud call relies on ambient
# configuration — --project is passed explicitly every time.
#
set -euo pipefail

PROJECT="${PROJECT:-congo-voice}"
REGION="${REGION:-africa-south1}"
DOMAIN="${DOMAIN:-congovoicecd.com}"
ENVIRONMENT="${ENVIRONMENT:-pilot}"
PREFIX="congovoice-${ENVIRONMENT}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INFRA="$REPO_ROOT/infra"
TFVARS="environments/${ENVIRONMENT}.tfvars"
STATE_BUCKET="${PROJECT}-tfstate"
DB_PASSWORD_SECRET="cvos-${ENVIRONMENT}-db-password"
SECRET_KEYS=(session_secret data_encryption_key database_url cron_secret
             anthropic_api_key gemini_api_key openai_api_key)

step() { printf '\n\033[1m── %s\033[0m\n' "$*"; }
note() { printf '   %s\n' "$*"; }
die()  { printf '\n\033[31mSTOPPED: %s\033[0m\n' "$*" >&2; exit 1; }
gc()   { gcloud "$@" --project="$PROJECT"; }

# ── 0. The machine ───────────────────────────────────────────────────────────

step "Checking the machine"
command -v gcloud >/dev/null || die "gcloud is not installed."
if ! command -v terraform >/dev/null; then
  note "Terraform is not installed. Installing into ~/bin, which survives a Cloud Shell reset."
  mkdir -p "$HOME/bin"
  tf_version=$(curl -fsS https://checkpoint-api.hashicorp.com/v1/check/terraform \
    | python3 -c "import json,sys;print(json.load(sys.stdin)['current_version'])")
  tmp=$(mktemp -d)
  curl -fsSLo "$tmp/tf.zip" \
    "https://releases.hashicorp.com/terraform/${tf_version}/terraform_${tf_version}_linux_amd64.zip"
  unzip -oq "$tmp/tf.zip" -d "$HOME/bin"
  rm -rf "$tmp"
  grep -q 'HOME/bin' "$HOME/.bashrc" 2>/dev/null \
    || echo 'export PATH="$HOME/bin:$PATH"' >> "$HOME/.bashrc"
fi
export PATH="$HOME/bin:$PATH"
note "$(terraform version | head -1)"

step "Checking the project and its billing"
gcloud config set project "$PROJECT" >/dev/null 2>&1 || true
gcloud projects describe "$PROJECT" --format='value(projectId)' >/dev/null \
  || die "Project '$PROJECT' does not exist, or this account cannot see it. Run: gcloud projects list"
billing=$(gcloud billing projects describe "$PROJECT" --format='value(billingEnabled)')
[[ "$billing" == "True" ]] \
  || die "Billing is not enabled on '$PROJECT'. Link an account at https://console.cloud.google.com/billing and run this again."
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
note "project $PROJECT ($PROJECT_NUMBER), billing enabled, region $REGION"

# ── 1. APIs ──────────────────────────────────────────────────────────────────

step "Enabling the APIs"
wanted=(run sqladmin secretmanager cloudscheduler artifactregistry
        servicenetworking compute dns iam cloudbuild)
enabled=$(gc services list --enabled --format='value(config.name)')
for api in "${wanted[@]}"; do
  if grep -qx "$api.googleapis.com" <<<"$enabled"; then
    note "already on: $api"
  else
    gc services enable "$api.googleapis.com" && note "enabled: $api"
  fi
done

# ── 2. Terraform state, and the database password ────────────────────────────

step "Terraform state bucket"
if gc storage buckets describe "gs://$STATE_BUCKET" >/dev/null 2>&1; then
  note "already exists: gs://$STATE_BUCKET"
else
  gc storage buckets create "gs://$STATE_BUCKET" --location="$REGION" \
    --uniform-bucket-level-access --public-access-prevention
  gc storage buckets update "gs://$STATE_BUCKET" --versioning
  note "created: gs://$STATE_BUCKET (versioned, private)"
fi

step "Database password"
if gc secrets describe "$DB_PASSWORD_SECRET" >/dev/null 2>&1; then
  note "already stored in Secret Manager: $DB_PASSWORD_SECRET"
else
  openssl rand -base64 32 | tr -d '\n' \
    | gc secrets create "$DB_PASSWORD_SECRET" --data-file=- --replication-policy=automatic
  note "generated and stored: $DB_PASSWORD_SECRET"
fi
# Terraform reads it from the environment, so it never lands in a file that
# could be committed.
export TF_VAR_db_password="$(gc secrets versions access latest --secret="$DB_PASSWORD_SECRET")"
[[ -n "$TF_VAR_db_password" ]] || die "Could not read $DB_PASSWORD_SECRET."

# ── 3. The variables file ────────────────────────────────────────────────────

step "Variables file"
cd "$INFRA"
if [[ ! -f "$TFVARS" ]]; then
  cp "environments/${ENVIRONMENT}.tfvars.example" "$TFVARS"
  note "created $TFVARS from the example"
fi
python3 - "$TFVARS" "$PROJECT" "$REGION" "$DOMAIN" <<'PY'
import re, sys
path, project, region, domain = sys.argv[1:5]
s = open(path).read()
def setvar(src, name, value):
    line = f'{name} = "{value}"'
    pattern = rf'^{name}\s*=.*$'
    return re.sub(pattern, line, src, count=1, flags=re.M) if re.search(pattern, src, re.M) else src + "\n" + line + "\n"
for name, value in (("project_id", project), ("region", region), ("domain", domain),
                    ("public_url", f"https://{domain}")):
    s = setvar(s, name, value)
open(path, "w").write(s)
PY
note "project_id=$PROJECT region=$REGION domain=$DOMAIN"

step "Terraform init"
terraform init -input=false -backend-config="bucket=$STATE_BUCKET" >/dev/null
note "backend: gs://$STATE_BUCKET"

# ── 4. The registry, before anything is pushed to it ─────────────────────────

step "Image registry"
terraform apply -input=false -auto-approve -var-file="$TFVARS" \
  -target=google_project_service.required \
  -target=google_artifact_registry_repository.app >/dev/null
note "$(terraform output -raw image_repository)"

step "Cloud Build permissions"
# A new project runs Cloud Build as the Compute Engine default account, which
# may push nowhere and write no logs until it is told it may.
for role in artifactregistry.writer logging.logWriter; do
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
    --role="roles/$role" --condition=None >/dev/null
  note "granted roles/$role"
done

# ── 5. The image ─────────────────────────────────────────────────────────────

step "Building the image (this is the slow one — 3 to 15 minutes)"
cd "$REPO_ROOT"
TAG=$(git rev-parse --short HEAD)
IMAGE_PATH="${REGION}-docker.pkg.dev/${PROJECT}/cvos/app"
if gc artifacts docker images describe "${IMAGE_PATH}:${TAG}" >/dev/null 2>&1; then
  note "an image for $TAG is already in the registry; not rebuilding"
else
  gc builds submit --config cloudbuild.yaml \
    --substitutions="_REGION=${REGION},_SITE_URL=https://${DOMAIN},_TAG=${TAG}"
fi
DIGEST=$(gc artifacts docker images describe "${IMAGE_PATH}:${TAG}" \
  --format='value(image_summary.digest)')
[[ "$DIGEST" == sha256:* ]] || die "Could not read the image digest for tag $TAG."
note "digest $DIGEST"

# Deploy by digest, never by tag: a tag can be moved under a running service.
cd "$INFRA"
python3 - "$TFVARS" "${IMAGE_PATH}@${DIGEST}" <<'PY'
import re, sys
path, image = sys.argv[1:3]
s = open(path).read()
s = re.sub(r'^image\s*=.*$', f'image = "{image}"', s, count=1, flags=re.M)
open(path, "w").write(s)
PY
note "pinned in $TFVARS"

# ── 6. Everything except the service ─────────────────────────────────────────

step "Database, bucket, identity, secret containers (10 to 20 minutes — PostgreSQL is the slow part)"
terraform apply -input=false -auto-approve -var-file="$TFVARS" \
  -target=google_sql_database_instance.main \
  -target=google_sql_database.app \
  -target=google_sql_user.app \
  -target=google_storage_bucket.media \
  -target=google_service_account.app \
  -target=google_storage_bucket_iam_member.app_media \
  -target=google_project_iam_member.app_sql \
  -target=google_secret_manager_secret.app \
  -target=google_secret_manager_secret_iam_member.app
DB_IP=$(terraform output -raw database_private_ip)
[[ -n "$DB_IP" ]] || die "The database has no private address yet."
note "database private address: $DB_IP"

# ── 7. Secret values ─────────────────────────────────────────────────────────
#
# Terraform creates the containers; it never writes a value. Cloud Run refuses
# to start a service mounting a secret with no version, so every one needs a
# version — including a vendor key nobody has supplied. An empty version is the
# honest answer there: the gateway reads a blank credential as "not configured"
# and stays on the offline provider rather than registering a vendor whose every
# call would fail with a 401.

step "Secret values"
has_version() { [[ -n "$(gc secrets versions list "$1" --filter='state=enabled' --format='value(name)' --limit=1)" ]]; }
add_version() { printf '%s' "$2" | gc secrets versions add "$1" --data-file=- >/dev/null; }
# Secret Manager rejects a zero-byte payload in some API versions, and Cloud Run
# still needs a version to exist. A single space is accepted everywhere and the
# gateway trims it, so it reaches the application as "not configured" either way.
add_blank_version() {
  add_version "$1" "" 2>/dev/null || add_version "$1" " "
}

for key in "${SECRET_KEYS[@]}"; do
  name="${PREFIX}-${key}"
  if has_version "$name"; then
    note "already set: $key"
    continue
  fi
  case "$key" in
    session_secret|data_encryption_key|cron_secret)
      add_version "$name" "$(openssl rand -hex 32)"; note "generated: $key" ;;
    database_url)
      add_version "$name" "postgresql://cvos_app:${TF_VAR_db_password}@${DB_IP}:5432/cvos?sslmode=require"
      note "composed: $key" ;;
    *)
      # An existing environment variable wins: `export ANTHROPIC_API_KEY=...`
      # before running this loads a real key instead of an empty placeholder.
      env_name=$(tr '[:lower:]' '[:upper:]' <<<"$key")
      value="${!env_name:-}"
      if [[ -n "$value" ]]; then
        add_version "$name" "$value"; note "loaded from \$$env_name: $key"
      else
        add_blank_version "$name"; note "left blank (offline provider): $key"
      fi ;;
  esac
done

# ── 8. The service ───────────────────────────────────────────────────────────

step "The service, its scheduler job and the domain mapping"
terraform apply -input=false -auto-approve -var-file="$TFVARS"

step "Done"
SERVICE_URL=$(terraform output -raw service_url)
printf '\n'
note "The platform answers at: $SERVICE_URL"
printf '\n'
note "DNS records to add at your registrar for $DOMAIN:"
terraform output -json dns_records_to_create | python3 -c \
  "import json,sys; [print('     ' + r) for r in json.load(sys.stdin)]"
printf '\n'
note "Then, once the records resolve and the certificate is issued:"
note "  curl -sI https://$DOMAIN | head -3"
note "  npm run preflight -- https://$DOMAIN"
printf '\n'
note "Do NOT run 'npm run seed' against this database — it is synthetic"
note "demonstration data. Create the real accounts in /admin/utilisateurs."
printf '\n'
