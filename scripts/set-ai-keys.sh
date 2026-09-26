#!/usr/bin/env bash
#
# Put the AI vendor keys into Secret Manager, one prompt at a time.
#
#   bash scripts/set-ai-keys.sh
#
# Written so a key never has to be typed on a command line. Cloud Shell keeps
# its shell history in $HOME, which persists, so a key pasted into a command
# stays in ~/.bash_history for good. This reads each one with the terminal echo
# off and pipes it straight to gcloud: it is never printed, never stored in a
# file, and never becomes a history entry.
#
# Press Enter at any prompt to skip that vendor and leave it as it is.
#
# There is nothing to rebuild afterwards. The service mounts each secret at
# :latest, so the next revision picks the keys up — but a running revision keeps
# the version it started with, so a redeploy is what makes them take effect:
#
#   bash scripts/go-live.sh
#
set -euo pipefail

PROJECT="${PROJECT:-congo-voice}"
ENVIRONMENT="${ENVIRONMENT:-pilot}"
NAME="congovoice-${ENVIRONMENT}"

step() { printf '\n\033[1m── %s\033[0m\n' "$*"; }
note() { printf '   %s\n' "$*"; }
warn() { printf '   \033[33m%s\033[0m\n' "$*"; }
die()  { printf '\n\033[31mSTOPPED: %s\033[0m\n' "$*" >&2; exit 1; }
gc()   { gcloud "$@" --project="$PROJECT"; }

gcloud projects describe "$PROJECT" --format='value(projectId)' >/dev/null \
  || die "Project '$PROJECT' does not exist or this account cannot see it."

cat <<INTRO

  Three vendors. Paste a key at its prompt and press Enter, or press Enter
  alone to skip it. Nothing you type is shown, logged or kept in history.

  Only one is needed for the platform to use a real model. Where more than one
  is set, the gateway's AI_LLM_ORDER decides which answers first and which is
  the fallback.

INTRO

changed=0
for vendor in anthropic gemini openai; do
  secret="${NAME}-${vendor}_api_key"
  exists=$(gc secrets versions list "$secret" --filter='state=enabled' \
             --format='value(name)' 2>/dev/null | wc -l)

  step "$vendor"
  if ! gc secrets describe "$secret" >/dev/null 2>&1; then
    warn "No secret named $secret. Run scripts/go-live.sh first — it creates them."
    continue
  fi
  note "$exists version(s) stored; the newest is what the next revision uses."

  printf '   Key (Enter to skip): '
  IFS= read -rs key || true
  printf '\n'

  if [[ -z "$key" ]]; then
    note "skipped"
    continue
  fi

  # A key pasted from a web page often arrives with a newline, a stray quote, or
  # the surrounding whitespace of a selection. Fix what is unambiguous and
  # refuse what is not: a key with a space inside it is a bad paste, not a key,
  # and storing it would fail later as an authentication error that looks like a
  # vendor outage.
  key="${key#"${key%%[![:space:]]*}"}"
  key="${key%"${key##*[![:space:]]}"}"
  key="${key%\"}"; key="${key#\"}"
  key="${key%\'}"; key="${key#\'}"
  if [[ "$key" =~ [[:space:]] ]]; then
    warn "That contains a space, so it is a truncated or joined paste rather than a key. Not stored."
    continue
  fi
  if (( ${#key} < 20 )); then
    warn "That is only ${#key} characters, which is shorter than any of these vendors issue. Not stored."
    continue
  fi

  printf '%s' "$key" | gc secrets versions add "$secret" --data-file=- >/dev/null
  unset key
  note "stored (${vendor}), $(gc secrets versions list "$secret" --filter='state=enabled' --format='value(name)' | wc -l) version(s) now"
  changed=$((changed + 1))
done

step "Done"
if (( changed == 0 )); then
  note "Nothing changed."
else
  note "$changed key(s) stored. They take effect on the next revision:"
  printf '\n'
  note "  bash scripts/go-live.sh"
  printf '\n'
  note "A running revision keeps the secret versions it started with, so the"
  note "keys are not live until that deploy replaces it."
fi
printf '\n'
note "One thing that decides whether they are used at all: the residency policy."
note "Anthropic, Gemini and OpenAI are all US-hosted, so DATA_RESIDENCY must"
note "include US or the gateway refuses them and stays on the offline provider."
note "This deployment declares: ${DATA_RESIDENCY:-ZA,US}"
printf '\n'
