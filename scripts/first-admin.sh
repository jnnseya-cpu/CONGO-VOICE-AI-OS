#!/usr/bin/env bash
#
# Find out whether a platform administrator exists — and create one if not.
#
#   bash scripts/first-admin.sh
#
# "Numéro ou code PIN incorrect" is the same answer for three different
# situations, on purpose: no account with that number, an account that is not
# active, and a wrong code. A citizen must not be able to tell those apart. The
# person running the platform needs to.
#
# /api/v1/system/bootstrap answers the question without guessing, because it
# refuses outright once an administrator exists:
#
#   403  an administrator EXISTS. Nothing was created. Your number or your code
#        is wrong — use scripts/recover-admin.sh.
#   200  none existed, and now one does. Sign in with what you just typed.
#   400  refused the code or the number, and says which.
#
# It runs against whatever revision is serving now: BOOTSTRAP_TOKEN is already
# attached to the service, so this needs no deploy.
#
set -uo pipefail

PROJECT="${PROJECT:-congo-voice}"
REGION="${REGION:-africa-south1}"
ENVIRONMENT="${ENVIRONMENT:-pilot}"
SERVICE="congovoice-${ENVIRONMENT}"

step() { printf '\n\033[1m── %s\033[0m\n' "$*"; }
note() { printf '   %s\n' "$*"; }
die()  { printf '\n\033[31mSTOPPED: %s\033[0m\n' "$*" >&2; exit 1; }
gc()   { gcloud "$@" --project="$PROJECT"; }

command -v gcloud >/dev/null || die "gcloud is not installed here."

URL=$(gc run services describe "$SERVICE" --region="$REGION" --format='value(status.url)' 2>/dev/null) \
  || die "No Cloud Run service '$SERVICE' in $REGION."
note "service: $URL"

step "Reading the bootstrap token the service already has"
TOKEN=$(gc secrets versions access latest --secret=bootstrap_token 2>/dev/null) \
  || die "Could not read the secret 'bootstrap_token'. Check its name with: gcloud secrets list --project=$PROJECT"
[[ -n "$TOKEN" ]] || die "The secret is empty."
note "read (not printed)"

step "The administrator account"
note "The code is 6 to 12 characters. Letters are allowed, but NOT more than 12"
note "characters — a longer password is refused, and that refusal is the most"
note "likely reason there is no account now."
read -r -p "   Phone number, with country code (e.g. +447952030184): " PHONE
read -r -p "   Name: " NAME
read -r -s -p "   Code (6-12 characters): " PIN; echo
read -r -s -p "   Again: " PIN2; echo
[[ "$PIN" == "$PIN2" ]] || die "The two codes do not match."
[[ ${#PIN} -ge 6 && ${#PIN} -le 12 ]] || die "The code is ${#PIN} characters. It must be 6 to 12."
[[ -n "$PHONE" && -n "$NAME" ]] || die "The number and the name are both required."

step "Asking the service"
BODY=$(PHONE="$PHONE" PIN="$PIN" NAME="$NAME" python3 -c 'import json,os; print(json.dumps({"phone":os.environ["PHONE"],"pin":os.environ["PIN"],"name":os.environ["NAME"]}))')
RESPONSE=$(curl -sS -X POST "${URL}/api/v1/system/bootstrap" \
  -H "content-type: application/json" -H "x-bootstrap-token: ${TOKEN}" \
  -w '\n%{http_code}' -d "$BODY")
CODE=$(printf '%s' "$RESPONSE" | tail -n1)
OUT=$(printf '%s' "$RESPONSE" | sed '$d')

case "$CODE" in
  200)
    printf '\n'
    note "CREATED. There was no platform administrator until now — which is why"
    note "signing in kept saying the number or code was incorrect. There was no"
    note "account to sign in to."
    printf '\n'
    note "Sign in at ${URL}/connexion with that number and that code."
    note "On a phone, tap 'Mon code contient des lettres' if your code has any."
    printf '\n%s\n' "$OUT"
    ;;
  403)
    printf '\n'
    note "An administrator ALREADY EXISTS. Nothing was created."
    note "So the account is there and the number or the code you are signing in"
    note "with does not match it. The number is matched on its digits with the"
    note "country code kept, exactly as typed at registration: +447952030184,"
    note "447952030184 and 07952030184 are three different accounts."
    printf '\n'
    note "To set a new code on it:  bash scripts/recover-admin.sh"
    ;;
  400)
    printf '\n'
    note "Refused: $OUT"
    note "Either the code is too easy to guess, or that number is already"
    note "registered to a non-administrator account."
    ;;
  404)
    printf '\n'
    note "The service answered 404, which means BOOTSTRAP_TOKEN is not attached"
    note "to the running revision, or the token does not match. Check:"
    note "  gcloud run services describe ${SERVICE} --region=${REGION} \\"
    note "    --project=${PROJECT} --format='value(spec.template.spec.containers[0].env)'"
    ;;
  429)
    note "Rate limited. Wait a minute and run this again."
    ;;
  *)
    note "Unexpected status ${CODE}: $OUT"
    ;;
esac
