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

step "Which administrators exist"
#
# Asked before anything else, because the number was the thing nobody knew.
# bootstrap says "an administrator exists" without saying which number it is
# under, and this endpoint used to say "no administrator with that number"
# without saying what the numbers were. Both were true at once, and between
# them a person spent an afternoon typing a number that had never been the
# right one.
LIST=$(curl -sS -X POST "${URL}/api/v1/system/recover-admin" \
  -H "content-type: application/json" -H "x-recovery-token: ${TOKEN}" \
  -d '{"list":true}' 2>/dev/null)

if ! printf '%s' "$LIST" | python3 -c 'import json,sys; json.load(sys.stdin)["administrators"]' 2>/dev/null; then
  note "Could not list the administrators. The service said:"
  printf '%s\n' "$LIST"
  die "Deploy the current code with scripts/ship.sh, then run this again."
fi

# Built without nested quotes of any kind. The first version escaped double
# quotes inside an f-string inside shell single quotes, which bash passes
# through literally and Python rejects — so the listing died with a
# SyntaxError, the recovery carried on regardless, and the number the whole
# exercise existed to reveal was never printed.
printf '%s' "$LIST" | python3 -c '
import json, sys
rows = json.load(sys.stdin)["administrators"]
if not rows:
    print("   (none - there is no platform administrator at all)")
for i, r in enumerate(rows, 1):
    name = r["name"] or "(no name)"
    print("   %d. %s  |  number ending %s  |  %s" % (i, name, r["phone"], r["status"]))
'
COUNT=$(printf '%s' "$LIST" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)["administrators"]))')
[[ "$COUNT" -gt 0 ]] || die "There is no platform administrator. Use scripts/first-admin.sh to create one."

step "The administrator to recover"
if [[ "$COUNT" == "1" ]]; then
  CHOICE=1
  note "One administrator. Recovering that one."
else
  read -r -p "   Which one? [1-${COUNT}] " CHOICE
fi
USER_ID=$(printf '%s' "$LIST" | CHOICE="$CHOICE" python3 -c '
import json, os, sys
rows = json.load(sys.stdin)["administrators"]
i = int(os.environ["CHOICE"]) - 1
print(rows[i]["id"] if 0 <= i < len(rows) else "")
')
[[ -n "$USER_ID" ]] || die "That is not one of the numbers listed."

# A number that will not decrypt means the row was written under a different
# DATA_ENCRYPTION_KEY, and the lookup index beside it is keyed by the same
# secret — so that account cannot be signed into with any number and any code
# until both columns are rewritten. Resetting the code alone does nothing, which
# is exactly what happened: the reset succeeded twice and sign-in still failed.
UNREADABLE=$(printf '%s' "$LIST" | CHOICE="$CHOICE" python3 -c '
import json, os, sys
rows = json.load(sys.stdin)["administrators"]
i = int(os.environ["CHOICE"]) - 1
print("yes" if rows[i]["phone"] == "(illisible)" else "no")
')
PHONE_ARG=""
if [[ "$UNREADABLE" == "yes" ]]; then
  printf '\n'
  note "This account's number cannot be read with the encryption key this"
  note "deployment is using, so nothing can match it at sign-in. The number"
  note "has to be set again now, under the current key."
  read -r -p "   Number to sign in with, e.g. +447952030184: " NEWPHONE
  DIGITS=$(printf '%s' "$NEWPHONE" | tr -cd '0-9')
  [[ ${#DIGITS} -ge 11 ]] || die "That is ${#DIGITS} digits. Include the country code."
  PHONE_ARG="$NEWPHONE"
fi

read -r -s -p "   New code (6 to 12 characters, letters allowed): " PIN; echo
read -r -s -p "   Again: " PIN2; echo
[[ "$PIN" == "$PIN2" ]] || die "The two codes do not match."
[[ ${#PIN} -ge 6 && ${#PIN} -le 12 ]] || die "The code must be 6 to 12 characters."

step "Calling the service"
BODY=$(USER_ID="$USER_ID" PIN="$PIN" PHONE_ARG="$PHONE_ARG" python3 -c '
import json, os
body = {"userId": os.environ["USER_ID"], "pin": os.environ["PIN"]}
if os.environ.get("PHONE_ARG"):
    body["phone"] = os.environ["PHONE_ARG"]
print(json.dumps(body))
')
RESPONSE=$(curl -sS -X POST "${URL}/api/v1/system/recover-admin" \
  -H "content-type: application/json" \
  -H "x-recovery-token: ${TOKEN}" \
  -w '\n%{http_code}' \
  -d "$BODY")
CODE=$(printf '%s' "$RESPONSE" | tail -n1)
BODY_OUT=$(printf '%s' "$RESPONSE" | sed '$d')

case "$CODE" in
  200)
    note "Done."
    printf '\n'
    printf '%s' "$BODY_OUT" | python3 -c '
import json, sys
r = json.load(sys.stdin)["recovered"]
print("   Sign in as:  %s" % (r["name"] or "(no name)"))
print("   Number ending:  %s" % r["phone"])
print("   Code: the one you just typed twice.")
' 2>/dev/null || true
    printf '\n%s\n' "$BODY_OUT"
    ;;
  404)
    note "The account chosen above no longer matches. That should not happen —"
    note "run this again, and if it repeats, send this output."
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
