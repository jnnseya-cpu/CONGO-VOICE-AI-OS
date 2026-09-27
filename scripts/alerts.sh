#!/usr/bin/env bash
#
# Make failures noticeable. Nothing here changes how the service behaves.
#
#   ALERT_EMAIL=ops@example.org bash scripts/alerts.sh
#   ALERT_EMAIL=ops@example.org BUDGET_USD=300 bash scripts/alerts.sh
#
# Why this exists: the deployment created a service, a database, a bucket, a
# scheduler and a load balancer, and not one thing that would tell anybody when
# any of them stopped working. A platform where a caregiver's escalation can fail
# silently at three in the morning is not being operated, it is being hoped for.
# "Critical failures can occur silently" is a launch blocker on its own.
#
# It is idempotent: every object is looked up by display name first and skipped
# if it exists, so this is safe to re-run.
#
# What it creates:
#   1. An email notification channel.
#   2. An uptime check against the public domain's readiness probe.
#   3. Alert: the uptime check fails.
#   4. Alert: Cloud Run 5xx responses appear.
#   5. Alert: Cloud Run container instances are failing to start.
#   6. Alert: Cloud SQL is down or nearly out of disk.
#   7. Optional: a billing budget with threshold alerts, when BUDGET_USD is set.
#      This is the denial-of-wallet backstop — the per-address AI rate limit bounds
#      the rate, and only a budget bounds the total.
#
set -euo pipefail

PROJECT="${PROJECT:-congo-voice}"
REGION="${REGION:-africa-south1}"
ENVIRONMENT="${ENVIRONMENT:-pilot}"
SERVICE="${SERVICE:-congovoice-${ENVIRONMENT}}"
DOMAIN="${DOMAIN:-congovoicecd.com}"
DB_INSTANCE="${DB_INSTANCE:-congovoice-${ENVIRONMENT}-pg}"
ALERT_EMAIL="${ALERT_EMAIL:-}"
BUDGET_USD="${BUDGET_USD:-}"

step() { printf '\n\033[1m── %s\033[0m\n' "$*"; }
note() { printf '   %s\n' "$*"; }
die()  { printf '\n\033[31mSTOPPED: %s\033[0m\n' "$*" >&2; exit 1; }
gc()   { gcloud "$@" --project="$PROJECT"; }

[[ -n "$ALERT_EMAIL" ]] || die "set ALERT_EMAIL to the address that should be woken up, e.g. ALERT_EMAIL=ops@example.org bash scripts/alerts.sh"

step "Enabling the APIs these objects live in"
for api in monitoring.googleapis.com logging.googleapis.com; do
  gc services enable "$api" >/dev/null 2>&1 && note "on: ${api%%.*}" || note "already on: ${api%%.*}"
done

step "Notification channel"
CHANNEL="$(gc alpha monitoring channels list \
  --filter="displayName='CVOS ${ENVIRONMENT} ops' AND type=email" \
  --format='value(name)' 2>/dev/null | head -1)"
if [[ -z "$CHANNEL" ]]; then
  CHANNEL_FILE="$(mktemp)"
  cat >"$CHANNEL_FILE" <<JSON
{
  "type": "email",
  "displayName": "CVOS ${ENVIRONMENT} ops",
  "description": "Where CONGO VOICE AI OS ${ENVIRONMENT} failures are sent.",
  "labels": { "email_address": "${ALERT_EMAIL}" }
}
JSON
  CHANNEL="$(gc alpha monitoring channels create --channel-content-from-file="$CHANNEL_FILE" --format='value(name)')"
  rm -f "$CHANNEL_FILE"
  note "created: ${CHANNEL}"
  note "Confirm the address: Google sends a verification email and an unverified"
  note "channel silently delivers nothing, which is worse than no channel at all."
else
  note "exists: ${CHANNEL}"
fi

step "Uptime check on https://${DOMAIN}/api/v1/system/ready"
if ! gc monitoring uptime list-configs --filter="displayName='CVOS ${ENVIRONMENT} ready'" --format='value(name)' 2>/dev/null | grep -q .; then
  gc monitoring uptime create "CVOS ${ENVIRONMENT} ready" \
    --resource-type=uptime-url \
    --resource-labels="host=${DOMAIN},project_id=${PROJECT}" \
    --path="/api/v1/system/ready" \
    --port=443 \
    --protocol=https \
    --period=5 \
    --timeout=10 \
    --matcher-type=contains-string \
    --matcher-content='"status":"ready"' >/dev/null
  note "created — checks every 5 minutes from several regions"
  note "It matches on the body, not only on 200: a page that returns 200 while"
  note "reporting not_ready is exactly the failure an HTTP-only check misses."
else
  note "exists"
fi

# Creates an alert policy from a file, keyed on display name so re-runs are safe.
policy() {
  local name="$1" body="$2"
  if gc alpha monitoring policies list --filter="displayName='${name}'" --format='value(name)' 2>/dev/null | grep -q .; then
    note "exists: ${name}"
    return
  fi
  local f; f="$(mktemp)"
  printf '%s' "$body" >"$f"
  gc alpha monitoring policies create --policy-from-file="$f" --notification-channels="$CHANNEL" >/dev/null
  rm -f "$f"
  note "created: ${name}"
}

step "Alert policies"

policy "CVOS ${ENVIRONMENT} — the site is not answering" "$(cat <<JSON
{
  "displayName": "CVOS ${ENVIRONMENT} — the site is not answering",
  "documentation": {
    "content": "The readiness probe on https://${DOMAIN} has been failing. Check Cloud Run revisions first (scripts/rollback.sh --list), then Cloud SQL. If the last deploy caused it: scripts/rollback.sh.",
    "mimeType": "text/markdown"
  },
  "combiner": "OR",
  "conditions": [{
    "displayName": "uptime check failing",
    "conditionThreshold": {
      "filter": "metric.type=\\"monitoring.googleapis.com/uptime_check/check_passed\\" AND resource.type=\\"uptime_url\\"",
      "aggregations": [{ "alignmentPeriod": "300s", "perSeriesAligner": "ALIGN_FRACTION_TRUE" }],
      "comparison": "COMPARISON_LT",
      "thresholdValue": 0.5,
      "duration": "300s",
      "trigger": { "count": 1 }
    }
  }],
  "alertStrategy": { "autoClose": "1800s" }
}
JSON
)"

policy "CVOS ${ENVIRONMENT} — server errors" "$(cat <<JSON
{
  "displayName": "CVOS ${ENVIRONMENT} — server errors",
  "documentation": {
    "content": "Cloud Run is returning 5xx on ${SERVICE}. Every 5xx here is a citizen who asked something and got nothing. Logs carry a trace= value on each 500; search Cloud Logging for it, and the interactions row with the same trace_id shows what was asked.",
    "mimeType": "text/markdown"
  },
  "combiner": "OR",
  "conditions": [{
    "displayName": "5xx responses",
    "conditionThreshold": {
      "filter": "metric.type=\\"run.googleapis.com/request_count\\" AND resource.type=\\"cloud_run_revision\\" AND resource.label.\\"service_name\\"=\\"${SERVICE}\\" AND metric.label.\\"response_code_class\\"=\\"5xx\\"",
      "aggregations": [{ "alignmentPeriod": "300s", "perSeriesAligner": "ALIGN_RATE", "crossSeriesReducer": "REDUCE_SUM" }],
      "comparison": "COMPARISON_GT",
      "thresholdValue": 0.05,
      "duration": "300s",
      "trigger": { "count": 1 }
    }
  }],
  "alertStrategy": { "autoClose": "1800s" }
}
JSON
)"

policy "CVOS ${ENVIRONMENT} — containers will not start" "$(cat <<JSON
{
  "displayName": "CVOS ${ENVIRONMENT} — containers will not start",
  "documentation": {
    "content": "Cloud Run instances are failing their startup probe on ${SERVICE}. This is what a bad migration or a missing secret looks like. The revision's own log lines say why; scripts/rollback.sh returns traffic to the previous revision.",
    "mimeType": "text/markdown"
  },
  "combiner": "OR",
  "conditions": [{
    "displayName": "startup probe failures",
    "conditionMatchedLog": {
      "filter": "resource.type=\\"cloud_run_revision\\" AND resource.labels.service_name=\\"${SERVICE}\\" AND (textPayload:\\"startup probe failed\\" OR textPayload:\\"failed to start\\" OR textPayload:\\"database_unreachable\\")"
    }
  }],
  "alertStrategy": {
    "notificationRateLimit": { "period": "900s" },
    "autoClose": "1800s"
  }
}
JSON
)"

policy "CVOS ${ENVIRONMENT} — database unavailable or nearly full" "$(cat <<JSON
{
  "displayName": "CVOS ${ENVIRONMENT} — database unavailable or nearly full",
  "documentation": {
    "content": "Cloud SQL ${DB_INSTANCE} is down or above 85% disk. Storage auto-increase is enabled, so a sustained disk alert usually means growth nobody planned for. scripts/dr-drill.sh proves the backup is restorable; run it before you need it.",
    "mimeType": "text/markdown"
  },
  "combiner": "OR",
  "conditions": [
    {
      "displayName": "instance not up",
      "conditionThreshold": {
        "filter": "metric.type=\\"cloudsql.googleapis.com/database/up\\" AND resource.type=\\"cloudsql_database\\"",
        "aggregations": [{ "alignmentPeriod": "300s", "perSeriesAligner": "ALIGN_MIN" }],
        "comparison": "COMPARISON_LT",
        "thresholdValue": 1,
        "duration": "300s",
        "trigger": { "count": 1 }
      }
    },
    {
      "displayName": "disk above 85%",
      "conditionThreshold": {
        "filter": "metric.type=\\"cloudsql.googleapis.com/database/disk/utilization\\" AND resource.type=\\"cloudsql_database\\"",
        "aggregations": [{ "alignmentPeriod": "300s", "perSeriesAligner": "ALIGN_MEAN" }],
        "comparison": "COMPARISON_GT",
        "thresholdValue": 0.85,
        "duration": "600s",
        "trigger": { "count": 1 }
      }
    }
  ],
  "alertStrategy": { "autoClose": "3600s" }
}
JSON
)"

if [[ -n "$BUDGET_USD" ]]; then
  step "Billing budget (the denial-of-wallet backstop)"
  BILLING="$(gcloud beta billing projects describe "$PROJECT" --format='value(billingAccountName)' 2>/dev/null | sed 's|billingAccounts/||')"
  if [[ -z "$BILLING" ]]; then
    note "could not read the billing account; skipping the budget"
  elif gcloud billing budgets list --billing-account="$BILLING" --filter="displayName='CVOS ${ENVIRONMENT}'" --format='value(name)' 2>/dev/null | grep -q .; then
    note "exists"
  else
    gcloud billing budgets create \
      --billing-account="$BILLING" \
      --display-name="CVOS ${ENVIRONMENT}" \
      --budget-amount="${BUDGET_USD}USD" \
      --filter-projects="projects/${PROJECT}" \
      --threshold-rule=percent=0.5 \
      --threshold-rule=percent=0.9 \
      --threshold-rule=percent=1.0 >/dev/null
    note "created: ${BUDGET_USD} USD, alerting at 50%, 90% and 100%"
    note "The per-address AI limit bounds the rate of provider spend. Only this"
    note "bounds the total, and provider spend is the one cost on this platform"
    note "that an outsider can drive."
  fi
else
  step "Billing budget"
  note "skipped — set BUDGET_USD to create one. Without it, nothing caps the"
  note "monthly provider bill, which is the cost an attacker can influence."
fi

step "Now test it"
note "An alert that has never fired is not an alert. Prove each one:"
note ""
note "  1. Site down:      gcloud run services update-traffic ${SERVICE} \\"
note "                       --region=${REGION} --to-revisions=LATEST=100 --project=${PROJECT}"
note "                     then stop the database briefly, or point the uptime"
note "                     check at a path that does not exist, and wait 10 min."
note "  2. Server errors:  curl -sS https://${DOMAIN}/api/v1/system/health -H 'x-force-error: 1'"
note "                     (or any request you know returns 500) repeatedly for 5 min."
note "  3. Containers:     deploy a revision with a deliberately wrong secret."
note "  4. Database:       gcloud sql instances patch ${DB_INSTANCE} --activation-policy=NEVER"
note "                     then --activation-policy=ALWAYS. Do this in a window."
note ""
note "Record who received each one and how long it took. An alert nobody is"
note "assigned to is the same as no alert."
