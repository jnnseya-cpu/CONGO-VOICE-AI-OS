#!/usr/bin/env bash
#
# Clear the exchanges the pilot accumulated while it was being tested.
#
#   bash scripts/reset-pilot-data.sh
#
# Four test messages — three of them escalated by bugs since fixed — leave every
# chart describing faults rather than a service. This gives the first real day a
# first real day.
#
# It is NOT `npm run seed`. That writes synthetic demonstration data and refuses
# to run in production. This writes nothing; it deletes.
#
# Three things are deliberately kept:
#
#   the audit log      hash-chained, so deleting rows would break the chain and
#                      the platform would then correctly report that its own
#                      record had been tampered with. The purge is written INTO
#                      it. A reset that edits the proof is the one operation
#                      nobody should be able to perform.
#   accounts           yours included, or you would delete your way back in.
#                      Anonymous sessions created by testing ARE removed.
#   clinical content   protocols, board signatures, the knowledge base,
#                      provinces, glossaries, language measurements.
#
# The confirmation is the number of exchanges that will be destroyed, which you
# can only know by asking first. A typed word becomes a habit; a number that
# changes if somebody used the service in the meantime does not.
#
set -euo pipefail

PROJECT="${PROJECT:-congo-voice}"
REGION="${REGION:-africa-south1}"
ENVIRONMENT="${ENVIRONMENT:-pilot}"
NAME="congovoice-${ENVIRONMENT}"

step() { printf '\n\033[1m── %s\033[0m\n' "$*"; }
note() { printf '   %s\n' "$*"; }
warn() { printf '   \033[33m%s\033[0m\n' "$*"; }
die()  { printf '\n\033[31mSTOPPED: %s\033[0m\n' "$*" >&2; exit 1; }

command -v python3 >/dev/null || die "python3 is required to read the responses."

step "Finding the service"
URL=$(gcloud run services describe "$NAME" --region="$REGION" --project="$PROJECT" --format='value(status.url)' 2>/dev/null || true)
[[ -n "$URL" ]] || die "No Cloud Run service '$NAME' in $REGION."
note "$URL"

step "Signing in"
note "The account must be a platform administrator. Sign-in is by phone and PIN."
read -rp "   Phone (+243...): " ADMIN_PHONE
printf '   PIN (hidden): '
IFS= read -rs ADMIN_PIN; printf '\n'
[[ -n "$ADMIN_PHONE" && -n "$ADMIN_PIN" ]] || die "A phone number and a PIN are required."

login=$(ADMIN_PHONE="$ADMIN_PHONE" ADMIN_PIN="$ADMIN_PIN" python3 -c '
import json, os
print(json.dumps({"phone": os.environ["ADMIN_PHONE"], "pin": os.environ["ADMIN_PIN"]}))')
unset ADMIN_PIN

# --data-binary @- so the PIN never appears in a process listing.
COOKIE_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR"' EXIT
response=$(printf '%s' "$login" | curl -sS --max-time 60 -c "$COOKIE_JAR" \
  -X POST "${URL}/api/v1/auth/login" -H "Content-Type: application/json" \
  --data-binary @- -w '\n%{http_code}')
status=$(tail -1 <<<"$response")
[[ "$status" == "200" ]] || { printf '   %s\n' "$(sed '$d' <<<"$response")"; die "Sign-in refused (${status})."; }
note "signed in"

call() {
  # $1 = JSON body
  printf '%s' "$1" | curl -sS --max-time 300 -b "$COOKIE_JAR" \
    -X POST "${URL}/api/v1/system/reset-pilot-data" \
    -H "Content-Type: application/json" --data-binary @- -w '\n%{http_code}'
}

step "What would be removed"
preview=$(call '{"dryRun":true}')
status=$(tail -1 <<<"$preview")
payload=$(sed '$d' <<<"$preview")
if [[ "$status" != "200" ]]; then
  printf '   %s\n' "$payload"
  die "The preview was refused (${status}). Only a platform administrator may do this."
fi

COUNT=$(python3 -c '
import json, sys
d = json.load(sys.stdin)
c = d["counts"]
labels = {
  "interactions": "échanges",
  "cases": "cas",
  "notifications": "notifications",
  "files": "fichiers (enregistrements, photos)",
  "followUps": "suivis",
  "feedback": "retours",
  "drafts": "brouillons",
  "anonymousUsers": "sessions anonymes",
}
for k, label in labels.items():
    print(f"   {c.get(k, 0):>6}  {label}", file=sys.stderr)
print(d["confirmWith"])
' <<<"$payload")

if [[ "$COUNT" == "0" ]]; then
  printf '\n'
  note "Aucun échange enregistré : il n'y a rien à effacer."
  printf '\n'
  exit 0
fi

cat <<WARNING

  Ceci est irréversible.

  Sont conservés : le journal d'audit (chaîné, il prouve ce que le programme a
  fait, et la purge y sera inscrite), tous les comptes nommés — dont le vôtre —
  et l'ensemble du contenu clinique : protocoles, signatures du comité, base de
  connaissances, provinces, glossaires, mesures de qualité des langues.

  Les enregistrements vocaux et les photos sont supprimés du stockage, pas
  seulement de la base.

WARNING
read -rp "   Tapez le nombre d'échanges à supprimer (${COUNT}) pour confirmer : " typed
[[ "$typed" == "$COUNT" ]] || { printf '\n  Non confirmé. Rien n'"'"'a été supprimé.\n\n'; exit 1; }

step "Effacement"
result=$(call "{\"dryRun\":false,\"confirmCount\":${COUNT}}")
status=$(tail -1 <<<"$result")
payload=$(sed '$d' <<<"$result")
if [[ "$status" != "200" ]]; then
  printf '   %s\n' "$payload"
  die "Refusé (${status}). Si le nombre a changé, quelqu'un a utilisé le service entre-temps : relancez."
fi

python3 -c '
import json, sys
d = json.load(sys.stdin)
c = d["counts"]
print(f"   {sum(c.values())} enregistrement(s) supprimé(s).")
print(f"   {d[\"storageObjectsDeleted\"]} objet(s) retirés du stockage.")
if d.get("storageFailures"):
    print(f"   {d[\"storageFailures\"]} fichier(s) dont les octets n’ont pas pu être supprimés — à vérifier dans le bucket.")
' <<<"$payload"

printf '\n'
note "Le tableau de bord repart de zéro. Le journal d'audit conserve la trace"
note "de ce qui a existé, sans texte personnel, et la purge y est enregistrée."
printf '\n'
