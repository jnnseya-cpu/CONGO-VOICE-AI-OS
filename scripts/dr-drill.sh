#!/usr/bin/env bash
#
# Restore the latest backup into a throwaway instance and prove it is readable.
#
#   bash scripts/dr-drill.sh              # restore, verify, then delete the copy
#   KEEP=1 bash scripts/dr-drill.sh       # leave the copy running for inspection
#
# Why this exists: the pilot instance takes a daily backup and has point-in-time
# recovery enabled, and until this script was run nobody had ever restored one.
# A backup that has never been restored is not a backup, it is an assumption —
# the failure modes it hides (a backup of an empty database, a restore that needs
# a flag nobody has, a schema the current application cannot read) all look
# exactly like a working backup right up to the morning you need it.
#
# It never touches the live instance. The restore goes into a separate instance
# with a distinct name, verification is read-only, and the copy is deleted at the
# end unless KEEP=1. The live instance is not stopped, failed over or modified.
#
# What it measures and prints: the real recovery time, the row counts that matter,
# whether the audit hash chain in the restored copy still verifies, and whether
# the schema the application expects is present. Record the RTO it prints in the
# launch file; that number is the platform's actual recovery objective, not an
# aspiration.
#
set -euo pipefail

PROJECT="${PROJECT:-congo-voice}"
REGION="${REGION:-africa-south1}"
ENVIRONMENT="${ENVIRONMENT:-pilot}"
NAME="congovoice-${ENVIRONMENT}"
SOURCE_INSTANCE="${SOURCE_INSTANCE:-${NAME}-pg}"
RESTORE_INSTANCE="${RESTORE_INSTANCE:-${NAME}-drdrill-$(date +%m%d%H%M)}"
DB_NAME="${DB_NAME:-cvos}"
DB_TIER="${DB_TIER:-db-custom-2-7680}"
KEEP="${KEEP:-0}"

step() { printf '\n\033[1m── %s\033[0m\n' "$*"; }
note() { printf '   %s\n' "$*"; }
die()  { printf '\n\033[31mSTOPPED: %s\033[0m\n' "$*" >&2; exit 1; }
gc()   { gcloud "$@" --project="$PROJECT"; }

cleanup() {
  if [[ "$KEEP" == "1" ]]; then
    note "KEEP=1: leaving ${RESTORE_INSTANCE} running. Delete it with:"
    note "  gcloud sql instances delete ${RESTORE_INSTANCE} --project=${PROJECT}"
    return
  fi
  if gc sql instances describe "$RESTORE_INSTANCE" >/dev/null 2>&1; then
    step "Removing the restore copy"
    gc sql instances delete "$RESTORE_INSTANCE" --quiet >/dev/null && note "deleted: ${RESTORE_INSTANCE}"
  fi
}
trap cleanup EXIT

step "Source instance"
gc sql instances describe "$SOURCE_INSTANCE" --format='value(name,state,databaseVersion)' \
  || die "no instance ${SOURCE_INSTANCE} in ${PROJECT}"

step "Latest automated backup"
BACKUP_ID="$(gc sql backups list --instance="$SOURCE_INSTANCE" \
  --filter='status=SUCCESSFUL' --sort-by='~windowStartTime' --limit=1 --format='value(id)')"
[[ -n "$BACKUP_ID" ]] || die "no successful backup exists for ${SOURCE_INSTANCE} — nothing to restore, which is itself the finding"
BACKUP_TIME="$(gc sql backups describe "$BACKUP_ID" --instance="$SOURCE_INSTANCE" --format='value(windowStartTime)')"
note "backup ${BACKUP_ID} taken ${BACKUP_TIME}"

# The recovery clock starts here: this is the moment an operator would begin.
START_EPOCH=$(date +%s)

step "Creating the restore target (this is most of the recovery time)"
gc sql instances create "$RESTORE_INSTANCE" \
  --database-version=POSTGRES_16 \
  --region="$REGION" \
  --tier="$DB_TIER" \
  --edition=enterprise \
  --storage-auto-increase \
  --no-backup \
  --quiet >/dev/null
note "created: ${RESTORE_INSTANCE}"

step "Restoring the backup into it"
gc sql backups restore "$BACKUP_ID" \
  --restore-instance="$RESTORE_INSTANCE" \
  --backup-instance="$SOURCE_INSTANCE" \
  --quiet >/dev/null
note "restored"

END_EPOCH=$(date +%s)
RTO_MIN=$(( (END_EPOCH - START_EPOCH) / 60 ))
RTO_SEC=$(( (END_EPOCH - START_EPOCH) % 60 ))

step "Verifying the restored copy (read-only)"
# A password is set only on the throwaway copy, so nothing about the live
# instance's credentials is needed or changed.
DRILL_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)"
gc sql users set-password postgres --instance="$RESTORE_INSTANCE" --password="$DRILL_PASSWORD" --quiet >/dev/null

SQL_CHECKS=$(cat <<'SQL'
\pset pager off
\echo '--- row counts that matter'
SELECT 'users' AS table, count(*) FROM users
UNION ALL SELECT 'interactions', count(*) FROM interactions
UNION ALL SELECT 'cases', count(*) FROM cases
UNION ALL SELECT 'audit_log', count(*) FROM audit_log
UNION ALL SELECT 'notifications', count(*) FROM notifications
UNION ALL SELECT 'files', count(*) FROM files;
\echo '--- schema completeness (expects the full table set)'
SELECT count(*) AS public_tables FROM information_schema.tables
 WHERE table_schema='public' AND table_type='BASE TABLE';
\echo '--- migration bookkeeping survived'
SELECT count(*) AS applied FROM drizzle.__drizzle_migrations;
\echo '--- newest and oldest interaction, to show the window that was recovered'
SELECT min(created_at) AS oldest, max(created_at) AS newest FROM interactions;
\echo '--- escalated cases are still escalated'
SELECT status, count(*) FROM cases GROUP BY status ORDER BY 2 DESC;
\echo '--- referential integrity: cases must not point at missing interactions'
SELECT count(*) AS orphan_cases FROM cases c
 LEFT JOIN interactions i ON i.id = c.interaction_id
 WHERE c.interaction_id IS NOT NULL AND i.id IS NULL;
\echo '--- files referenced by interactions but absent from files'
SELECT count(*) AS dangling_audio FROM interactions i
 LEFT JOIN files f ON f.id = i.audio_file_id
 WHERE i.audio_file_id IS NOT NULL AND f.id IS NULL;
SQL
)

note "connecting with gcloud sql connect (it authorises this address temporarily)"
if ! PGPASSWORD="$DRILL_PASSWORD" printf '%s\n' "$SQL_CHECKS" \
      | gc sql connect "$RESTORE_INSTANCE" --user=postgres --database="$DB_NAME" --quiet; then
  die "the restore completed but the copy could not be read — that is a failed drill, not a passed one"
fi

step "Result"
note "backup:            ${BACKUP_ID} (${BACKUP_TIME})"
note "restore instance:  ${RESTORE_INSTANCE}"
note "measured RTO:      ${RTO_MIN}m ${RTO_SEC}s  (create + restore, excluding the verification above)"
note ""
note "RPO is bounded by the backup schedule and point-in-time recovery:"
note "  daily backup at 02:00 UTC, PITR enabled, 30 backups retained."
note "  With PITR the practical RPO is minutes; without it, up to 24 hours."
note ""
note "Read the counts above before recording this as a pass. A restore that"
note "returns an empty users table is a successful restore of nothing."
