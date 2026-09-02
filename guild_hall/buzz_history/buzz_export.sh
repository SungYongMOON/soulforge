#!/usr/bin/env bash
# Read-only Buzz relay exporter, executed inside the WSL distribution that
# hosts the relay's Docker stack.
#
#   bash buzz_export.sh --run <run_id> --out-dir <dir> \
#     [--received-since <iso>] [--deleted-since <iso>] \
#     --audit-seq-min <n> --overlap-seconds <n> --limit <n> \
#     --container <name> --db-name <name> --db-user <name> [--dry-run]
#
# Every statement is a SELECT issued through
# `docker exec -e PGOPTIONS='-c default_transaction_read_only=on'`, so the
# session cannot write even if a statement were changed to try. The script
# owns no credential: PostgreSQL is reached over the container's local socket
# with trust authentication, so no token, password, or key is read, passed, or
# printed. It writes only into the staging directory it is given, create-only,
# and prints one `buzz_export.v1` meta document on stdout.
#
# Collection is not backup. Nothing here creates a backup generation, a
# restore test, or an acceptance record, and nothing is ever deleted.

set -euo pipefail

RUN_ID=""
OUT_DIR=""
RECEIVED_SINCE=""
DELETED_SINCE=""
AUDIT_SEQ_MIN=""
OVERLAP_SECONDS=""
ROW_LIMIT=""
CONTAINER=""
DB_NAME=""
DB_USER=""
DRY_RUN=0

fail() {
  printf 'buzz_export_rejected:%s\n' "$1" >&2
  exit 1
}

# Allowlists, not escaping: a value that is not exactly one of these shapes is
# refused before it can reach a SQL string. Quotes, backslashes, whitespace and
# semicolons cannot pass any of them.
require_match() {
  local value="$1" pattern="$2" code="$3"
  if [[ ! "${value}" =~ ${pattern} ]]; then
    fail "${code}"
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --run) [[ $# -ge 2 ]] || fail "argument_missing"; RUN_ID="$2"; shift 2 ;;
    --out-dir) [[ $# -ge 2 ]] || fail "argument_missing"; OUT_DIR="$2"; shift 2 ;;
    --received-since) [[ $# -ge 2 ]] || fail "argument_missing"; RECEIVED_SINCE="$2"; shift 2 ;;
    --deleted-since) [[ $# -ge 2 ]] || fail "argument_missing"; DELETED_SINCE="$2"; shift 2 ;;
    --audit-seq-min) [[ $# -ge 2 ]] || fail "argument_missing"; AUDIT_SEQ_MIN="$2"; shift 2 ;;
    --overlap-seconds) [[ $# -ge 2 ]] || fail "argument_missing"; OVERLAP_SECONDS="$2"; shift 2 ;;
    --limit) [[ $# -ge 2 ]] || fail "argument_missing"; ROW_LIMIT="$2"; shift 2 ;;
    --container) [[ $# -ge 2 ]] || fail "argument_missing"; CONTAINER="$2"; shift 2 ;;
    --db-name) [[ $# -ge 2 ]] || fail "argument_missing"; DB_NAME="$2"; shift 2 ;;
    --db-user) [[ $# -ge 2 ]] || fail "argument_missing"; DB_USER="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    *) fail "argument_unknown" ;;
  esac
done

ISO='^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{1,6}Z$'
require_match "${RUN_ID}" '^[A-Za-z0-9][A-Za-z0-9._:-]{0,120}$' "run_id_invalid"
require_match "${OUT_DIR}" '^/[A-Za-z0-9._/-]{1,4000}$' "out_dir_invalid"
require_match "${AUDIT_SEQ_MIN}" '^[0-9]{1,18}$' "audit_seq_min_invalid"
require_match "${OVERLAP_SECONDS}" '^[0-9]{1,5}$' "overlap_seconds_invalid"
require_match "${ROW_LIMIT}" '^[1-9][0-9]{0,5}$' "row_limit_invalid"
require_match "${CONTAINER}" '^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$' "container_invalid"
require_match "${DB_NAME}" '^[a-z_][a-z0-9_]{0,62}$' "db_name_invalid"
require_match "${DB_USER}" '^[a-z_][a-z0-9_]{0,62}$' "db_user_invalid"
if [[ -n "${RECEIVED_SINCE}" ]]; then
  require_match "${RECEIVED_SINCE}" "${ISO}" "received_since_invalid"
fi
if [[ -n "${DELETED_SINCE}" ]]; then
  require_match "${DELETED_SINCE}" "${ISO}" "deleted_since_invalid"
fi

[[ -d "${OUT_DIR}" ]] || fail "out_dir_missing"

# The overlap is applied here, on the relay's own clock arithmetic, so the
# window the rows are actually selected by is the window the receipt reports.
if [[ -n "${RECEIVED_SINCE}" ]]; then
  RECEIVED_PREDICATE="e.received_at > (timestamptz '${RECEIVED_SINCE}' - interval '${OVERLAP_SECONDS} seconds')"
else
  RECEIVED_PREDICATE="true"
fi
if [[ -n "${DELETED_SINCE}" ]]; then
  DELETED_PREDICATE="e.deleted_at > (timestamptz '${DELETED_SINCE}' - interval '${OVERLAP_SECONDS} seconds')"
else
  DELETED_PREDICATE="true"
fi

psql_read() {
  docker exec \
    -e PGOPTIONS='-c default_transaction_read_only=on' \
    "${CONTAINER}" \
    psql -U "${DB_USER}" -d "${DB_NAME}" -tAX -v ON_ERROR_STOP=1 -c "$1"
}

# One projection for both live rows and tombstones: an event soft-deleted
# between two runs would otherwise never have its bytes captured at all.
# `not_before` and `delivered_at` are bigint and are emitted as decimal text so
# no value can be rounded by a JSON number parser downstream.
event_projection() {
  cat <<SQL
jsonb_build_object(
  'community_id', e.community_id::text,
  'id', encode(e.id, 'hex'),
  'pubkey', encode(e.pubkey, 'hex'),
  'created_at', to_char(e.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'kind', e.kind,
  'tags', e.tags,
  'content', e.content,
  'sig', encode(e.sig, 'hex'),
  'received_at', to_char(e.received_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'channel_id', e.channel_id::text,
  'deleted_at', CASE WHEN e.deleted_at IS NULL THEN NULL
    ELSE to_char(e.deleted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END,
  'd_tag', e.d_tag,
  'not_before', e.not_before::text,
  'delivered_at', e.delivered_at::text
)
SQL
}

events_sql() {
  cat <<SQL
SELECT $(event_projection)
FROM events e
WHERE e.deleted_at IS NULL AND ${RECEIVED_PREDICATE}
ORDER BY e.received_at ASC, e.id ASC
LIMIT ${ROW_LIMIT}
SQL
}

tombstones_sql() {
  cat <<SQL
SELECT $(event_projection)
FROM events e
WHERE e.deleted_at IS NOT NULL AND ${DELETED_PREDICATE}
ORDER BY e.deleted_at ASC, e.id ASC
LIMIT ${ROW_LIMIT}
SQL
}

audit_sql() {
  cat <<SQL
SELECT jsonb_build_object(
  'community_id', a.community_id::text,
  'seq', a.seq::text,
  'hash', encode(a.hash, 'hex'),
  'prev_hash', CASE WHEN a.prev_hash IS NULL THEN NULL ELSE encode(a.prev_hash, 'hex') END,
  'action', a.action,
  'actor_pubkey', CASE WHEN a.actor_pubkey IS NULL THEN NULL ELSE encode(a.actor_pubkey, 'hex') END,
  'object_id', a.object_id,
  'detail', a.detail,
  'created_at', to_char(a.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
)
FROM audit_log a
WHERE a.seq >= ${AUDIT_SEQ_MIN}
ORDER BY a.community_id ASC, a.seq ASC
LIMIT ${ROW_LIMIT}
SQL
}

# Whole-table relay shape. `to_jsonb(t)` keeps unknown columns instead of
# silently dropping them when the relay schema moves; `communities` has its
# `signing_key` removed here so the secret never leaves PostgreSQL.
snapshot_sql() {
  cat <<SQL
SELECT jsonb_build_object(
  'channels', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)) FROM channels t), '[]'::jsonb),
  'channel_members', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)) FROM channel_members t), '[]'::jsonb),
  'users', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)) FROM users t), '[]'::jsonb),
  'communities', COALESCE((SELECT jsonb_agg((to_jsonb(t) - 'signing_key') ORDER BY (to_jsonb(t) - 'signing_key')) FROM communities t), '[]'::jsonb),
  'relay_members', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)) FROM relay_members t), '[]'::jsonb),
  'thread_metadata', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)) FROM thread_metadata t), '[]'::jsonb),
  'reactions', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)) FROM reactions t), '[]'::jsonb)
)
SQL
}

if [[ "${DRY_RUN}" -eq 1 ]]; then
  LIVE_COUNT="$(psql_read "SELECT count(*)::text FROM events e WHERE e.deleted_at IS NULL AND ${RECEIVED_PREDICATE}")"
  DEAD_COUNT="$(psql_read "SELECT count(*)::text FROM events e WHERE e.deleted_at IS NOT NULL AND ${DELETED_PREDICATE}")"
  AUDIT_COUNT="$(psql_read "SELECT count(*)::text FROM audit_log a WHERE a.seq >= ${AUDIT_SEQ_MIN}")"
  COMMUNITY_COUNT="$(psql_read "SELECT count(*)::text FROM communities")"
  READ_ONLY="$(psql_read "SELECT current_setting('transaction_read_only')")"
  printf '{"schema_version":"buzz_export.dry_run.v1","run_id":"%s","transaction_read_only":"%s","would_export":{"events":%s,"tombstones":%s,"audit":%s},"communities":%s,"row_limit":%s,"files_written":0}\n' \
    "${RUN_ID}" "${READ_ONLY}" "${LIVE_COUNT}" "${DEAD_COUNT}" "${AUDIT_COUNT}" "${COMMUNITY_COUNT}" "${ROW_LIMIT}"
  exit 0
fi

EVENTS_FILE="${OUT_DIR}/events-${RUN_ID}.jsonl"
TOMBSTONES_FILE="${OUT_DIR}/tombstones-${RUN_ID}.jsonl"
AUDIT_FILE="${OUT_DIR}/audit-${RUN_ID}.jsonl"
SNAPSHOT_FILE="${OUT_DIR}/snapshot-${RUN_ID}.json"
META_FILE="${OUT_DIR}/export-${RUN_ID}.json"

for TARGET in "${EVENTS_FILE}" "${TOMBSTONES_FILE}" "${AUDIT_FILE}" "${SNAPSHOT_FILE}" "${META_FILE}"; do
  [[ -e "${TARGET}" ]] && fail "staging_target_exists"
done

# `set -C` makes every redirection below create-only; a staging directory that
# is not exclusively ours fails the run instead of overwriting an export.
set -C
psql_read "$(events_sql)" > "${EVENTS_FILE}"
psql_read "$(tombstones_sql)" > "${TOMBSTONES_FILE}"
psql_read "$(audit_sql)" > "${AUDIT_FILE}"
psql_read "$(snapshot_sql)" > "${SNAPSHOT_FILE}"
set +C

COMMUNITY_COUNT="$(psql_read "SELECT count(*)::text FROM communities")"
require_match "${COMMUNITY_COUNT}" '^[0-9]{1,9}$' "community_count_invalid"

file_rows() {
  # `wc -l` counts terminators; psql ends every row with one, and an empty
  # result is a zero-byte file, so this is the exact row count.
  wc -l < "$1" | tr -d ' '
}

file_bytes() {
  wc -c < "$1" | tr -d ' '
}

file_sha256() {
  sha256sum "$1" | cut -d' ' -f1
}

meta_file_entry() {
  local kind="$1" path="$2" rows="$3"
  printf '{"kind":"%s","name":"%s","sha256":"sha256:%s","bytes":%s,"rows":%s}' \
    "${kind}" "$(basename "${path}")" "$(file_sha256 "${path}")" "$(file_bytes "${path}")" "${rows}"
}

EVENT_ROWS="$(file_rows "${EVENTS_FILE}")"
TOMBSTONE_ROWS="$(file_rows "${TOMBSTONES_FILE}")"
AUDIT_ROWS="$(file_rows "${AUDIT_FILE}")"
SNAPSHOT_ROWS="$(file_rows "${SNAPSHOT_FILE}")"
if [[ "${SNAPSHOT_ROWS}" != "1" ]]; then
  fail "snapshot_row_count_invalid"
fi

RECEIVED_SINCE_JSON="null"
[[ -n "${RECEIVED_SINCE}" ]] && RECEIVED_SINCE_JSON="\"${RECEIVED_SINCE}\""
DELETED_SINCE_JSON="null"
[[ -n "${DELETED_SINCE}" ]] && DELETED_SINCE_JSON="\"${DELETED_SINCE}\""
GENERATED_AT="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"

set -C
cat > "${META_FILE}" <<META
{
  "schema_version": "buzz_export.v1",
  "run_id": "${RUN_ID}",
  "generated_at": "${GENERATED_AT}",
  "community_count": ${COMMUNITY_COUNT},
  "window": {
    "received_since": ${RECEIVED_SINCE_JSON},
    "deleted_since": ${DELETED_SINCE_JSON},
    "audit_seq_min": ${AUDIT_SEQ_MIN},
    "overlap_seconds": ${OVERLAP_SECONDS},
    "row_limit": ${ROW_LIMIT}
  },
  "files": [
    $(meta_file_entry events "${EVENTS_FILE}" "${EVENT_ROWS}"),
    $(meta_file_entry tombstones "${TOMBSTONES_FILE}" "${TOMBSTONE_ROWS}"),
    $(meta_file_entry audit "${AUDIT_FILE}" "${AUDIT_ROWS}"),
    $(meta_file_entry snapshot "${SNAPSHOT_FILE}" "${SNAPSHOT_ROWS}")
  ]
}
META
set +C

cat "${META_FILE}"
