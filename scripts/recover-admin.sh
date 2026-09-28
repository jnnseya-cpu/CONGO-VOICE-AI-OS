#!/usr/bin/env bash
#
# Set a new code for the platform administrator who cannot sign in.
#
#   bash scripts/recover-admin.sh
#
# Every citizen who forgets their code has somebody to ask. The first platform
# administrator has nobody: the bootstrap endpoint refuses once an administrator
# exists, the database is on a private address, and there is no reset. This is
# the way back in, and it is deliberately a thing you switch on, use, and switch
# off again — not a door left open.
#
# It does four things, in this order, and stops at the first that fails:
#
#   1. puts ADMIN_RECOVERY_TOKEN into Secret Manager and onto the service;
#   2. asks for the number and the new code and calls the endpoint;
#   3. removes the token from the service again;
#   4. tells you to create a second administrator, so this is never needed twice.
#
set -uo pipefail

PROJECT="${PROJECT:-congo-voice}"
REGION="${REGION:-africa-south1}"
ENVIRONMENT="${ENVIRONMENT:-pilot}"
SERVICE="congovoice-${ENVIRONMENT}"
SECRET="admin_recovery_token"

step() { printf '\n\033[1m── %s\033[0m\n' "$*"; }
note() { printf '   %s\n' "$*"; }
die()  { printf '\n\033[31mSTOPPED: %s\033[0m\n' "$*" >&2; exit 1; }
gc()   { gcloud "$@" --project="$PROJECT"; }

command -v gcloud >/dev/null || die "gcloud is not installed here."

URL=$(gc run services describe "$SERVICE" --region="$REGION" --format='value(status.url)' 2>/dev/null) \
  || die "No Cloud Run service '$SERVICE' in $REGION."
[[ -n "$URL" ]] || die "Could not read the service URL."
note "service: $URL"

step "Arming the recovery token"
TOKEN=$(openssl rand -hex 32)
if gc secrets describe "$SECRET" >/dev/null 2>&1; then
  printf '%s' "$TOKEN" | gc secrets versions add "$SECRET" --data-file=- >/dev/null || die "Could not add a secret version."
else
  printf '%s' "$TOKEN" | gc secrets create "$SECRET" --data-file=- --replication-policy=automatic >/dev/null \
    || die "Could not create the secret."
fi
SA_EMAIL=$(gc run services describe "$SERVICE" --region="$REGION" --format='value(spec.template.spec.serviceAccountName)')
gc secrets add-iam-policy-binding "$SECRET" --member="serviceAccount:${SA_EMAIL}" --role=roles/secretmanager.secretAccessor >/dev/null 2>&1 || true

gc run services update "$SERVICE" --region="$REGION" \
  --update-secrets="ADMIN_RECOVERY_TOKEN=${SECRET}:latest" >/dev/null \
  || die "Could not attach the token to the service."
note "armed — the endpoint answers only while this is attached"

# Whatever happens next, the token comes off again.
disarm() {
  step "Disarming"
  if gc run services update "$SERVICE" --region="$REGION" --remove-secrets=ADMIN_RECOVERY_TOKEN >/dev/null 2>&1; then
    note "ADMIN_RECOVERY_TOKEN removed from the service."
  else
    note "COULD NOT REMOVE THE TOKEN. Do it now, by hand:"
    note "  gcloud run services update ${SERVICE} --region=${REGION} \\"
    note "    --remove-secrets=ADMIN_RECOVERY_TOKEN --project=${PROJECT}"
  fi
}
trap disarm EXIT

step "The administrator to recover"
read -r -p "   Phone number, exactly as registered (e.g. +243...): " PHONE
[[ -n "$PHONE" ]] || die "No number given."
read -r -s -p "   New code (6 to 12 characters, letters allowed): " PIN; echo
read -r -s -p "   Again: " PIN2; echo
[[ "$PIN" == "$PIN2" ]] || die "The two codes do not match."
[[ ${#PIN} -ge 6 && ${#PIN} -le 12 ]] || die "The code must be 6 to 12 characters."

step "Calling the service"
BODY=$(PHONE="$PHONE" PIN="$PIN" python3 -c 'import json,os; print(json.dumps({"phone":os.environ["PHONE"],"pin":os.environ["PIN"]}))')
RESPONSE=$(curl -sS -X POST "${URL}/api/v1/system/recover-admin" \
  -H "content-type: application/json" \
  -H "x-recovery-token: ${TOKEN}" \
  -w '\n%{http_code}' \
  -d "$BODY")
CODE=$(printf '%s' "$RESPONSE" | tail -n1)
BODY_OUT=$(printf '%s' "$RESPONSE" | sed '$d')

case "$CODE" in
  200)
    note "Done. Sign in with that number and the new code."
    printf '\n%s\n' "$BODY_OUT"
    ;;
  404)
    note "The service answered 404. Either the revision serving does not yet"
    note "carry this endpoint — deploy first — or that number is not a platform"
    note "administrator. The two are deliberately the same answer."
    ;;
  400)
    note "Refused: $BODY_OUT"
    note "The code is too easy to guess. Try one that is not a run or a repeat."
    ;;
  429)
    note "Rate limited. Wait a minute and run this again."
    ;;
  *)
    note "Unexpected status ${CODE}: $BODY_OUT"
    ;;
esac

step "Do this next"
note "1. Sign in and change nothing else until you have."
note "2. Create a SECOND platform administrator from /admin/utilisateurs."
note "   One administrator with no reset is how you got here; a second account"
note "   is the break-glass and costs nothing."
note "3. The recovery token is removed on the way out of this script. Check:"
note "   gcloud run services describe ${SERVICE} --region=${REGION} \\"
note "     --project=${PROJECT} --format='value(spec.template.spec.containers[0].env)'"
