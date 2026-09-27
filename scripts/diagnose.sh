#!/usr/bin/env bash
#
# Why did that turn fail? Ask the deployment, not the developer.
#
#   bash scripts/diagnose.sh
#   MINUTES=120 bash scripts/diagnose.sh
#
# The citizen sees "Le service est momentanément indisponible" because the
# pipeline threw, and the pipeline logs the reason. Everything below is a read:
# nothing is deployed, changed or restarted.
#
set -euo pipefail

PROJECT="${PROJECT:-congo-voice}"
REGION="${REGION:-africa-south1}"
ENVIRONMENT="${ENVIRONMENT:-pilot}"
SERVICE="${SERVICE:-congovoice-${ENVIRONMENT}}"
DOMAIN="${DOMAIN:-congovoicecd.com}"
MINUTES="${MINUTES:-60}"

step() { printf '\n\033[1m── %s\033[0m\n' "$*"; }
note() { printf '   %s\n' "$*"; }
gc()   { gcloud "$@" --project="$PROJECT"; }

step "Which revision is actually serving"
gc run services describe "$SERVICE" --region="$REGION" \
  --format='value(status.traffic[].revisionName, status.traffic[].percent)' || true
note "Image and commit of that revision:"
gc run services describe "$SERVICE" --region="$REGION" --format='value(spec.template.spec.containers[0].image)' || true
note ""
note "If the tag above is not the commit you last pushed, the fixes are not"
note "deployed and nothing else in this report is about the code you think."

step "Does the service answer at all, from outside"
for path in /api/v1/system/ready /api/v1/system/health /; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "https://${DOMAIN}${path}" || echo "000")
  note "GET https://${DOMAIN}${path} → ${code}"
done
note ""
note "Readiness body:"
curl -sS --max-time 20 "https://${DOMAIN}/api/v1/system/ready" | head -c 600 || true
echo

step "Pipeline failures in the last ${MINUTES} minutes"
note "These are the exact exceptions behind 'service momentanément indisponible'."
gc logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=${SERVICE} AND (textPayload:\"[orchestrator]\" OR textPayload:\"[api]\" OR severity>=ERROR)" \
  --freshness="${MINUTES}m" --limit=40 --order=desc \
  --format='value(timestamp, severity, textPayload)' || true

step "AI provider failures in the last ${MINUTES} minutes"
note "One line per provider that refused. If all of them appear, the keys, the"
note "quota or the egress are the problem — not the application."
gc logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=${SERVICE} AND textPayload:\"[ai-gateway]\"" \
  --freshness="${MINUTES}m" --limit=30 --order=desc \
  --format='value(timestamp, textPayload)' || true

step "Database and startup problems"
gc logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=${SERVICE} AND (textPayload:\"[db]\" OR textPayload:\"[ready]\" OR textPayload:\"Failed query\" OR textPayload:\"startup probe\")" \
  --freshness="${MINUTES}m" --limit=30 --order=desc \
  --format='value(timestamp, textPayload)' || true

step "Response codes, counted"
note "A wall of 200s with citizens still seeing failures means the pipeline is"
note "catching its own error and returning 200 with a failure message — which is"
note "exactly what the screenshots show."
gc logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=${SERVICE} AND httpRequest.requestUrl:\"/api/v1/interactions\"" \
  --freshness="${MINUTES}m" --limit=200 \
  --format='value(httpRequest.status)' 2>/dev/null | sort | uniq -c | sort -rn || true

step "Secrets the service is actually reading"
note "Names only — no values are printed."
gc run services describe "$SERVICE" --region="$REGION" \
  --format='value(spec.template.spec.containers[0].env[].name)' || true

step "What to send back"
note "Copy this whole output. The section that matters most is the first"
note "'[orchestrator]' line: it names the exception, and the exception names the"
note "defect. Everything else here is context for it."
