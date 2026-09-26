#!/usr/bin/env bash
#
# Remove everything scripts/go-live.sh created, in dependency order.
#
#   bash scripts/teardown.sh
#
# This exists because gcloud has no state file and therefore no `destroy`. It is
# the honest cost of not depending on Terraform, and it is written down rather
# than left as an exercise.
#
# THIS DELETES CITIZEN DATA. The database, every recording and photograph in the
# media bucket, and every encryption key. Deleting the data encryption key alone
# makes every stored phone number unreadable and unfindable for ever, because
# both the ciphertext and the blind index are derived from it — no backup of the
# database is any use without it.
#
# It refuses to run unless you type the project id, and it skips anything that
# is already gone.
#
set -euo pipefail

PROJECT="${PROJECT:-congo-voice}"
REGION="${REGION:-africa-south1}"
DOMAIN="${DOMAIN:-congovoicecd.com}"
ENVIRONMENT="${ENVIRONMENT:-pilot}"

NAME="congovoice-${ENVIRONMENT}"
SECRET_KEYS=(session_secret data_encryption_key database_url cron_secret
             anthropic_api_key gemini_api_key openai_api_key)

step() { printf '\n\033[1m── %s\033[0m\n' "$*"; }
note() { printf '   %s\n' "$*"; }
gc()   { gcloud "$@" --project="$PROJECT"; }
exists() { "$@" >/dev/null 2>&1; }
gone()  { note "already gone: $*"; }

cat <<WARNING

  This deletes the CONGO VOICE AI OS ${ENVIRONMENT} estate in project ${PROJECT}:

    the Cloud Run service        ${NAME}
    the scheduler job            ${NAME}-workflow
    the PostgreSQL instance      ${NAME}-pg   AND ALL DATA IN IT
    the media bucket             ${NAME}-media AND EVERY RECORDING IN IT
    all 7 secrets                ${NAME}-*     INCLUDING THE ENCRYPTION KEY
    the service account, the VPC, the peering range, the image registry

  Deleting the data encryption key is irreversible in a way a database backup
  cannot fix: every stored phone number is encrypted with a key derived from it
  and found through a blind index derived from it.

WARNING
read -r -p "  Type the project id to confirm: " typed
[[ "$typed" == "$PROJECT" ]] || { printf '\n  Not confirmed. Nothing was deleted.\n\n'; exit 1; }

step "Scheduler job"
# It may not be in the service's region: not every region offers Cloud
# Scheduler, so go-live.sh places it in the first one that accepts it.
sched_found=no
for loc in "$REGION" ${CRON_REGION:-} europe-west1 us-central1; do
  [[ -n "$loc" ]] || continue
  if exists gc scheduler jobs describe "${NAME}-workflow" --location="$loc"; then
    gc scheduler jobs delete "${NAME}-workflow" --location="$loc" --quiet && note "deleted (from $loc)"
    sched_found=yes
    break
  fi
done
[[ "$sched_found" == yes ]] || gone "${NAME}-workflow"

step "Domain mapping"
if exists gc beta run domain-mappings describe --domain="$DOMAIN" --region="$REGION"; then
  gc beta run domain-mappings delete --domain="$DOMAIN" --region="$REGION" --quiet && note "deleted"
else gone "$DOMAIN"; fi

step "Cloud Run service"
if exists gc run services describe "$NAME" --region="$REGION"; then
  gc run services delete "$NAME" --region="$REGION" --quiet && note "deleted"
else gone "$NAME"; fi

step "PostgreSQL"
if exists gc sql instances describe "${NAME}-pg"; then
  # Created with deletion protection on purpose; removing it is a separate act.
  gc sql instances patch "${NAME}-pg" --no-deletion-protection --quiet >/dev/null
  gc sql instances delete "${NAME}-pg" --quiet && note "deleted (with its data)"
else gone "${NAME}-pg"; fi

step "Media bucket"
if exists gc storage buckets describe "gs://${NAME}-media"; then
  gc storage rm --recursive "gs://${NAME}-media" --quiet && note "deleted (with its objects)"
else gone "${NAME}-media"; fi

step "Secrets"
for key in "${SECRET_KEYS[@]}"; do
  if exists gc secrets describe "${NAME}-${key}"; then
    gc secrets delete "${NAME}-${key}" --quiet && note "deleted: $key"
  else gone "$key"; fi
done
if exists gc secrets describe "cvos-${ENVIRONMENT}-db-password"; then
  gc secrets delete "cvos-${ENVIRONMENT}-db-password" --quiet && note "deleted: db password"
fi
if exists gc secrets describe "${NAME}-db_ca"; then
  gc secrets delete "${NAME}-db_ca" --quiet && note "deleted: db server CA"
fi

step "Service account"
if exists gc iam service-accounts describe "${NAME}-app@${PROJECT}.iam.gserviceaccount.com"; then
  gc iam service-accounts delete "${NAME}-app@${PROJECT}.iam.gserviceaccount.com" --quiet && note "deleted"
else gone "${NAME}-app"; fi

step "Network"
# The peering has to go before the reserved range, and the range before the
# network, or each delete fails with a dependency error.
if gc services vpc-peerings list --network="${NAME}-net" \
     --format='value(reservedPeeringRanges)' 2>/dev/null | grep -q "${NAME}-private-ip"; then
  gc services vpc-peerings delete --service=servicenetworking.googleapis.com \
    --network="${NAME}-net" --quiet >/dev/null && note "peering deleted"
else gone "peering"; fi
if exists gc compute addresses describe "${NAME}-private-ip" --global; then
  gc compute addresses delete "${NAME}-private-ip" --global --quiet && note "range deleted"
else gone "${NAME}-private-ip"; fi
if exists gc compute networks describe "${NAME}-net"; then
  gc compute networks delete "${NAME}-net" --quiet && note "network deleted"
else gone "${NAME}-net"; fi

step "Load balancer and domain"
# Front to back: a forwarding rule pins its proxy, a proxy its map and
# certificate, a backend its endpoint group. Deleting out of order fails with a
# resource-in-use error that names the wrong thing.
for rule in "${NAME}-https-rule" "${NAME}-http-rule"; do
  if exists gc compute forwarding-rules describe "$rule" --global; then
    gc compute forwarding-rules delete "$rule" --global --quiet && note "deleted: $rule"
  else gone "$rule"; fi
done
if exists gc compute target-https-proxies describe "${NAME}-https" --global; then
  gc compute target-https-proxies delete "${NAME}-https" --global --quiet && note "deleted: https proxy"
else gone "https proxy"; fi
if exists gc compute target-http-proxies describe "${NAME}-http" --global; then
  gc compute target-http-proxies delete "${NAME}-http" --global --quiet && note "deleted: http proxy"
else gone "http proxy"; fi
for map in "${NAME}-urlmap" "${NAME}-redirect"; do
  if exists gc compute url-maps describe "$map" --global; then
    gc compute url-maps delete "$map" --global --quiet && note "deleted: $map"
  else gone "$map"; fi
done
if exists gc compute ssl-certificates describe "${NAME}-cert" --global; then
  gc compute ssl-certificates delete "${NAME}-cert" --global --quiet && note "deleted: certificate"
else gone "certificate"; fi
if exists gc compute backend-services describe "${NAME}-backend" --global; then
  gc compute backend-services delete "${NAME}-backend" --global --quiet && note "deleted: backend"
else gone "backend"; fi
if exists gc compute network-endpoint-groups describe "${NAME}-neg" --region="$REGION"; then
  gc compute network-endpoint-groups delete "${NAME}-neg" --region="$REGION" --quiet && note "deleted: endpoint group"
else gone "endpoint group"; fi
if exists gc compute addresses describe "${NAME}-ip" --global; then
  gc compute addresses delete "${NAME}-ip" --global --quiet && note "deleted: static address"
else gone "static address"; fi

step "Image registry"
if exists gc artifacts repositories describe cvos --location="$REGION"; then
  gc artifacts repositories delete cvos --location="$REGION" --quiet && note "deleted"
else gone "cvos"; fi

step "Done"
note "The APIs are left enabled: turning one off could break something else"
note "in the project that also uses it."
printf '\n'
