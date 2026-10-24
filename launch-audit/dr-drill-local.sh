#!/usr/bin/env bash
# CYCLE 1 — a restore drill at the data layer, timed.
#
# This is not the Cloud SQL drill (that needs the cloud project and is on the
# human-action list). It is the one thing that can be proven here: that a copy of
# the data directory, taken with the service stopped, restores to exactly the
# state it was taken in — and that work done after the snapshot is genuinely gone
# afterwards, which is the half people forget to check.
set -uo pipefail
cd /home/user/CONGO-VOICE-AI-OS
DATA=/tmp/claude-0/e2e-data
SNAP=/tmp/claude-0/dr-snapshot
export $(grep -E '^(DATA_ENCRYPTION_KEY|SESSION_SECRET|CRON_SECRET)=' /tmp/claude-0/e2e.env | xargs)

start() {
  ( cd .next/standalone && setsid env NODE_ENV=production DATA_DIR="$DATA" PORT=3210 HOSTNAME=127.0.0.1 \
      STORAGE_DRIVER=local DEPLOYMENT_STAGE=pilot NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3210 \
      DATA_ENCRYPTION_KEY="$DATA_ENCRYPTION_KEY" SESSION_SECRET="$SESSION_SECRET" CRON_SECRET="$CRON_SECRET" \
      node server.js > /tmp/claude-0/dr-server.log 2>&1 < /dev/null & disown )
  for _ in $(seq 1 40); do
    curl -fsS http://127.0.0.1:3210/api/v1/system/ready >/dev/null 2>&1 && return 0
    command sleep 1
  done
  return 1
}
stop() { kill $(fuser -n tcp 3210 2>/dev/null | tr -d ' ') 2>/dev/null; for _ in $(seq 1 20); do fuser -n tcp 3210 >/dev/null 2>&1 || return 0; command sleep 1; done; }
count() {
  local token
  token=$(curl -s --max-time 10 -X POST -H 'Content-Type: application/json' -d '{"phone":"+243900000001","pin":"1234"}' http://127.0.0.1:3210/api/v1/auth/login | python3 -I -c 'import json,sys; print(json.load(sys.stdin).get("token",""))')
  curl -s --max-time 20 -H "Authorization: Bearer $token" 'http://127.0.0.1:3210/api/v1/interactions?scope=all&limit=200' \
    | python3 -I -c 'import json,sys; print(len(json.load(sys.stdin).get("interactions",[])))'
}

echo "── 1. stop the service and take the snapshot ──"
stop
t0=$(date +%s)
rm -rf "$SNAP" && cp -r "$DATA" "$SNAP"
echo "snapshot taken in $(( $(date +%s) - t0 ))s, size $(du -sh "$SNAP" | cut -f1)"

echo "── 2. start, record the state, then do more work ──"
start || { echo "FAIL: service did not come back after the snapshot"; exit 1; }
BEFORE=$(count)
echo "interactions at snapshot time: $BEFORE"
TOKEN=$(curl -s -X POST -H 'Content-Type: application/json' -d '{"anonymous":true,"language":"fr","province":"Kinshasa"}' http://127.0.0.1:3210/api/v1/auth/login | python3 -I -c 'import json,sys; print(json.load(sys.stdin)["token"])')
for i in 1 2 3; do
  curl -s -o /dev/null -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d "{\"text\":\"Question ecrite apres le snapshot numero $i\",\"module\":\"general\"}" http://127.0.0.1:3210/api/v1/interactions
done
AFTER_WORK=$(count)
echo "interactions after three more turns: $AFTER_WORK"

echo "── 3. lose the data directory and restore the snapshot ──"
stop
t1=$(date +%s)
rm -rf "$DATA" && cp -r "$SNAP" "$DATA"
start || { echo "FAIL: service did not start on the restored data"; exit 1; }
RTO=$(( $(date +%s) - t1 ))
RESTORED=$(count)
echo "interactions after restore: $RESTORED"
echo "time from loss to serving again: ${RTO}s"

echo "── 4. verdict ──"
if [[ "$RESTORED" == "$BEFORE" && "$AFTER_WORK" -gt "$BEFORE" ]]; then
  echo "PASS  the restore returned exactly the snapshot state ($BEFORE), and the ${AFTER_WORK} rows written afterwards are gone as expected"
  echo "      recovery point: everything after the snapshot is lost, which is what an unreplicated copy means"
  echo "      recovery time measured here: ${RTO}s for $(du -sh "$SNAP" | cut -f1) on local disk"
else
  echo "FAIL  before=$BEFORE after-work=$AFTER_WORK restored=$RESTORED"
fi
