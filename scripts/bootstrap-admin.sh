#!/usr/bin/env bash
#
# Create the first platform administrator.
#
#   bash scripts/bootstrap-admin.sh
#
# Every other account is created by an administrator in /admin/utilisateurs,
# which leaves a fresh deployment stuck: that page needs a platform_admin
# session and the only way to get one is that page. The database has no public
# address, so there is no psql to fall back on. This calls the one endpoint that
# breaks the circle, and that endpoint refuses for ever afterwards.
#
# Sign-in is by PHONE NUMBER and PIN. Not by e-mail — an e-mail address is not a
# credential anywhere in this platform.
#
set -euo pipefail

PROJECT="${PROJECT:-congo-voice}"
REGION="${REGION:-africa-south1}"
ENVIRONMENT="${ENVIRONMENT:-pilot}"
NAME="congovoice-${ENVIRONMENT}"

step() { printf '\n\033[1m── %s\033[0m\n' "$*"; }
note() { printf '   %s\n' "$*"; }
die()  { printf '\n\033[31mSTOPPED: %s\033[0m\n' "$*" >&2; exit 1; }
gc()   { gcloud "$@" --project="$PROJECT"; }

step "Finding the service"
URL=$(gc run services describe "$NAME" --region="$REGION" --format='value(status.url)' 2>/dev/null || true)
[[ -n "$URL" ]] || die "No Cloud Run service '$NAME' in $REGION."
note "$URL"

# The run.app origin, not the domain: this has to work before DNS and the
# certificate are finished, and it is an administrative call, not a citizen's.
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "${URL}/api/v1/system/ready" || echo 000)
[[ "$code" == 200 ]] || die "The service is not ready (${code} from /api/v1/system/ready). Run scripts/go-live.sh first."
note "ready"

step "Bootstrap token"
TOKEN=$(gc secrets versions access latest --secret="${NAME}-bootstrap_token" 2>/dev/null || true)
[[ -n "$TOKEN" ]] || die "No ${NAME}-bootstrap_token secret. Run scripts/go-live.sh, which creates and mounts it."
note "read from Secret Manager"

cat <<INTRO

  This creates ONE account: the platform administrator, who can then create
  everybody else. It works once — afterwards the endpoint refuses, whatever
  token is presented.

  The phone number is the login. Use the real number of the person who will
  administer the platform, in international form (+243...), because a lockout
  or a password reset reaches that number and nowhere else.

INTRO

read -rp "   Full name: " ADMIN_NAME
read -rp "   Phone (+243...): " ADMIN_PHONE
printf '   PIN (6 digits or more, hidden): '
IFS= read -rs ADMIN_PIN; printf '\n'
printf '   PIN again: '
IFS= read -rs ADMIN_PIN2; printf '\n'

[[ -n "$ADMIN_NAME"  ]] || die "A name is required."
[[ -n "$ADMIN_PHONE" ]] || die "A phone number is required."
[[ "$ADMIN_PIN" == "$ADMIN_PIN2" ]] || die "The two PINs do not match. Nothing was created."
(( ${#ADMIN_PIN} >= 6 )) || die "The PIN must be at least 6 digits. This account can create every other account."
[[ "$ADMIN_PHONE" == +* ]] || note "WARNING: '$ADMIN_PHONE' has no country code. A lockout notice would not reach it."

step "Creating"
body=$(ADMIN_NAME="$ADMIN_NAME" ADMIN_PHONE="$ADMIN_PHONE" ADMIN_PIN="$ADMIN_PIN" python3 -c '
import json, os
print(json.dumps({"name": os.environ["ADMIN_NAME"], "phone": os.environ["ADMIN_PHONE"], "pin": os.environ["ADMIN_PIN"]}))')
unset ADMIN_PIN ADMIN_PIN2

# The token goes in a header from a variable, and the body over stdin, so
# neither the PIN nor the token appears in a process listing.
response=$(printf '%s' "$body" | curl -sS --max-time 60 \
  -X POST "${URL}/api/v1/system/bootstrap" \
  -H "Content-Type: application/json" \
  -H "x-bootstrap-token: ${TOKEN}" \
  --data-binary @- -w '\n%{http_code}')
status=$(tail -1 <<<"$response")
payload=$(sed '$d' <<<"$response")

case "$status" in
  200|201)
    note "created"
    printf '\n'
    python3 -c 'import json,sys; d=json.load(sys.stdin); print("   " + d.get("next", ""))' <<<"$payload" 2>/dev/null || true
    printf '\n'
    note "Sign in at ${URL}/connexion with the phone number and PIN."
    printf '\n'
    note "Then, in this order:"
    note "  1. /admin/utilisateurs — the accounts for your team"
    note "  2. the review board — 2 physicians and 1 community health expert"
    note "  3. they sign the clinical content; until they do, the platform"
    note "     escalates and refers but does not reassure"
    note "  4. an SMS or WhatsApp provider, so an escalation reaches a person"
    printf '\n'
    note "Remove the token now that it is spent:"
    note "  gcloud run services update ${NAME} --region=${REGION} \\"
    note "    --remove-secrets=BOOTSTRAP_TOKEN --project=${PROJECT}"
    ;;
  403)
    note "Refused: an administrator already exists."
    note "Create further accounts from /admin/utilisateurs, signed in as that person."
    ;;
  404)
    die "The endpoint is not offered. BOOTSTRAP_TOKEN is not mounted on the running revision — run scripts/go-live.sh."
    ;;
  400)
    printf '   %s\n' "$payload"
    die "Rejected. Nothing was created."
    ;;
  *)
    printf '   %s\n' "$payload"
    die "Unexpected response ${status}. Nothing was created."
    ;;
esac
printf '\n'
