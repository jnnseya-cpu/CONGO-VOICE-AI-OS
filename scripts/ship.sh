#!/usr/bin/env bash
#
# Pull, deploy, and say what happened either way.
#
#   bash scripts/ship.sh
#
# Three commands were being run by hand in sequence, and the sequence is where it
# went wrong: a deploy that failed left nothing explaining why, and a deploy that
# succeeded left no proof the new revision was the one serving. This runs the
# diagnosis in both cases, because the failing case is the one that needs it most.
#
set -uo pipefail

BRANCH="${BRANCH:-claude/congo-voice-ai-os-3o5r8q}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"

step() { printf '\n\033[1m── %s\033[0m\n' "$*"; }
note() { printf '   %s\n' "$*"; }

cd "$REPO"

step "Fetching ${BRANCH}"
if ! git pull origin "$BRANCH"; then
  note "The pull failed. Nothing has been deployed."
  note "If you have local edits in the way: git stash, then run this again."
  exit 1
fi
note "now at $(git rev-parse --short HEAD) — $(git log -1 --format=%s)"

step "Deploying"
DEPLOY_STATUS=0
bash "$HERE/go-live.sh" || DEPLOY_STATUS=$?

if [[ $DEPLOY_STATUS -ne 0 ]]; then
  step "The deploy did not finish — diagnosing instead of stopping"
  note "Exit status ${DEPLOY_STATUS}. Whatever is serving now is the previous revision."
  bash "$HERE/diagnose.sh" || true
  echo
  note "Send the output above. The first [orchestrator] line names the defect;"
  note "the revision and image tag at the top say which code is actually running."
  exit "$DEPLOY_STATUS"
fi

step "Making sure the domain is in front of it"
#
# This used to be a separate script somebody had to remember, and the
# consequence of forgetting was not cosmetic: citizens were sent to the
# run.app URL, where the browser treats every visit as a different origin from
# the domain. Microphone permission is granted per origin, so every move
# between the two asked for the microphone again — on a voice-first service, on
# handsets whose owners have no reason to expect a second prompt.
#
# domain.sh changes nothing when the mapping already exists and the certificate
# is issued; it reports the state and stops. So it belongs in the deploy, where
# it cannot be forgotten, rather than in a runbook where it was.
#
DOMAIN_STATUS=0
bash "$HERE/domain.sh" || DOMAIN_STATUS=$?
if [[ $DOMAIN_STATUS -ne 0 ]]; then
  note "The domain step did not finish (exit ${DOMAIN_STATUS}). The new revision"
  note "is deployed and serving; only the address in front of it is unfinished."
fi

step "Deployed — now checking what is actually serving"
bash "$HERE/diagnose.sh" || true

echo
step "What to look at"
note "1. The image tag at the top: it must be the commit printed above."
note "2. The readiness body: 'ready' and no schema drift."
note "3. Any [orchestrator] lines: those are turns that failed for a citizen."
note "4. Any [ai-gateway] lines: those are providers refusing, which is keys,"
note "   quota or egress rather than the application."
note "5. The certificate line above: until it says ACTIVE, send nobody to the"
note "   domain — and send nobody to the run.app URL either, because the two"
note "   are different origins and the microphone permission does not carry"
note "   across. Wait for ACTIVE, then use the domain and only the domain."
