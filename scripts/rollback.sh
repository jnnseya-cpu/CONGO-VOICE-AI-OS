#!/usr/bin/env bash
#
# Send traffic back to the previous working revision, and prove it took.
#
#   bash scripts/rollback.sh                 # roll back one revision, verify, stop
#   bash scripts/rollback.sh --list          # show revisions and where traffic is
#   bash scripts/rollback.sh --to REVISION   # roll back to a named revision
#   bash scripts/rollback.sh --drill         # roll back, verify, roll forward again
#
# Cloud Run keeps every revision, so rolling back is a traffic change rather than
# a rebuild: it takes seconds and needs no image, no database change and no
# migration. That is the one genuinely fast lever this platform has during an
# incident, which is exactly why it must not be used for the first time during
# one.
#
# --drill is the rehearsal. It rolls back, checks the service actually answers on
# the old revision, then returns traffic to where it was and checks again, so the
# whole round trip is exercised and the service ends up where it started.
#
# What rolling back does NOT undo: a database migration. The schema bootstrap is
# additive — it adds columns and enum values and never drops or narrows anything —
# so an older revision runs against a newer schema, which is the direction that
# works. A change that genuinely breaks an older revision needs a forward fix,
# not this script, and that is the case worth knowing before you need it.
#
set -euo pipefail

PROJECT="${PROJECT:-congo-voice}"
REGION="${REGION:-africa-south1}"
ENVIRONMENT="${ENVIRONMENT:-pilot}"
SERVICE="${SERVICE:-congovoice-${ENVIRONMENT}}"
PROBE_PATH="${PROBE_PATH:-/api/v1/system/ready}"

step() { printf '\n\033[1m── %s\033[0m\n' "$*"; }
note() { printf '   %s\n' "$*"; }
die()  { printf '\n\033[31mSTOPPED: %s\033[0m\n' "$*" >&2; exit 1; }
gc()   { gcloud "$@" --project="$PROJECT"; }

revisions() {
  gc run revisions list --service="$SERVICE" --region="$REGION" \
    --sort-by='~metadata.creationTimestamp' --format='value(metadata.name)'
}

serving() {
  gc run services describe "$SERVICE" --region="$REGION" \
    --format='value(status.traffic[0].revisionName)'
}

service_url() {
  gc run services describe "$SERVICE" --region="$REGION" --format='value(status.url)'
}

# Answers on the revision that is actually serving, not on the domain: the load
# balancer and the certificate are a separate failure domain and would muddy the
# result.
verify() {
  local url; url="$(service_url)"
  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 30 "${url}${PROBE_PATH}" || echo 000)"
  note "GET ${url}${PROBE_PATH} → ${code}"
  [[ "$code" == "200" ]]
}

MODE=rollback
TARGET=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --list) MODE=list ;;
    --drill) MODE=drill ;;
    --to) TARGET="${2:-}"; shift ;;
    *) die "unknown argument: $1" ;;
  esac
  shift
done

step "Service"
CURRENT="$(serving)" || die "no service ${SERVICE} in ${REGION}"
note "serving: ${CURRENT}"

mapfile -t REVS < <(revisions)
[[ ${#REVS[@]} -gt 0 ]] || die "no revisions found"

if [[ "$MODE" == "list" ]]; then
  step "Revisions, newest first"
  for r in "${REVS[@]}"; do
    if [[ "$r" == "$CURRENT" ]]; then note "* ${r}   <- serving"; else note "  ${r}"; fi
  done
  exit 0
fi

if [[ -z "$TARGET" ]]; then
  for i in "${!REVS[@]}"; do
    if [[ "${REVS[$i]}" == "$CURRENT" ]]; then TARGET="${REVS[$((i+1))]:-}"; break; fi
  done
  [[ -n "$TARGET" ]] || die "no revision older than ${CURRENT} to roll back to"
fi
[[ "$TARGET" != "$CURRENT" ]] || die "${TARGET} is already serving"

step "Rolling traffic to ${TARGET}"
gc run services update-traffic "$SERVICE" --region="$REGION" --to-revisions="${TARGET}=100" >/dev/null
note "serving: $(serving)"

step "Verifying the rolled-back revision answers"
if verify; then
  note "healthy on ${TARGET}"
else
  note "the previous revision does NOT answer — this is the important finding"
  die "rollback target ${TARGET} is not healthy; do not rely on it. Investigate before launching."
fi

if [[ "$MODE" == "drill" ]]; then
  step "Rolling forward again to ${CURRENT}"
  gc run services update-traffic "$SERVICE" --region="$REGION" --to-revisions="${CURRENT}=100" >/dev/null
  note "serving: $(serving)"
  step "Verifying the original revision still answers"
  verify || die "rolled forward to ${CURRENT} but it does not answer"
  step "Drill complete"
  note "Rollback and roll-forward both verified. Traffic is back where it started."
  note "Record this in the launch file: rollback is tested, not theoretical."
else
  step "Rolled back"
  note "Traffic is on ${TARGET}. Roll forward when ready with:"
  note "  bash scripts/rollback.sh --to ${CURRENT}"
fi
