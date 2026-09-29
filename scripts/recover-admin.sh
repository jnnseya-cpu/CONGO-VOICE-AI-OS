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

step "Is this endpoint even in the image that is serving?"
#
# Asked before anything is armed, because the alternative is what happened the
# first time this script ran: a token minted, a revision deployed, a 404, and a
# second revision to undo it — all against an image built before the endpoint
# existed. The script reported "either the revision does not carry this endpoint
# or that number is not an administrator" and left a person to guess which.
#
# The route exports POST and nothing else, so Next answers GET with 405 when the
# file is deployed and 404 when it is not. That distinguishes the two without a
# token and without changing anything.
PROBE=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "${URL}/api/v1/system/recover-admin" 2>/dev/null || echo 000)
case "$PROBE" in
  405)
    note "yes — the running revision carries it"
    ;;
  404)
    printf '\n'
    note "The revision serving right now does NOT carry this endpoint, so there"
    note "is nothing to arm. Deploy the current code first:"
    printf '\n'
    note "    bash scripts/ship.sh"
    printf '\n'
    note "then run this again. Nothing has been changed."
    exit 1
    ;;
  000)
    die "Could not reach ${URL}. Check the service is serving before recovering."
    ;;
  *)
    note "unexpected status ${PROBE} from the probe — continuing, but if the"
    note "recovery below answers 404, deploy with scripts/ship.sh first."
    ;;
esac

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
read -r -p "   Phone number, exactly as registered (e.g. +447952030184): " PHONE
[[ -n "$PHONE" ]] || die "No number given."
# +7952030184 was typed once where +447952030184 was meant. The country code
# fell off, nothing matched, and the answer was indistinguishable from a wrong
# code — which is correct behaviour and useless to the person typing.
DIGITS=$(printf '%s' "$PHONE" | tr -cd '0-9')
if [[ ${#DIGITS} -lt 11 ]]; then
  note "That is ${#DIGITS} digits: ${PHONE}"
  note "A number with its country code is usually 11 to 15. A UK number is +44"
  note "then 10 digits; a Congolese one is +243 then 9."
  read -r -p "   Use it anyway? [y/N] " CONFIRM
  [[ "$CONFIRM" == "y" || "$CONFIRM" == "Y" ]] || die "Stopped. Nothing was sent."
fi
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
    note "The service answered 404. The probe above already established that the"
    note "endpoint IS deployed, so this means the number did not match a platform"
    note "administrator. The endpoint gives the same answer for an unknown number"
    note "and a wrong token on purpose, so it cannot confirm guesses."
    printf '\n'
    note "The number is matched on its digits with the country code kept, exactly"
    note "as it was typed at registration: +447952030184 and 07952030184 are two"
    note "different accounts. Try the other spellings you might have used."
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
