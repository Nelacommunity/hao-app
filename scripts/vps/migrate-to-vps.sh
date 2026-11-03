#!/usr/bin/env bash
# Moves Hao's Supabase from the hosted project to self-hosted Supabase on a VPS: database (schema, data,
# auth users with their passwords, migration history), Vault secrets, cron jobs, Storage files, and links
# to stored files. Follows supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore.
#
#   cp scripts/vps/vps.env.example .vps.env.local     # fill it in (git-ignored)
#   scripts/vps/migrate-to-vps.sh all                 # or one step: dump | restore | post | storage | verify
#
# Needs Docker running (the Supabase CLI and psql run in containers) and Node (for the Storage copy).
# The hosted project is only read. The VPS database should be fresh: restore stops at the first error.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.vps.env.local}"
[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE (copy scripts/vps/vps.env.example)"; exit 1; }
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
for name in OLD_DB_URL OLD_API_URL OLD_SERVICE_KEY NEW_DB_URL NEW_API_URL NEW_SERVICE_KEY; do
  [ -n "${!name:-}" ] || { echo "$name is not set in $ENV_FILE"; exit 1; }
done

BACKUP="${BACKUP:-$ROOT/supabase/.vps-backup}"
mkdir -p "$BACKUP"
chmod 700 "$BACKUP"
# The VPS runs Postgres 17 like the hosted project (supabase/config.toml major_version).
PG_IMAGE="${PG_IMAGE:-postgres:17-alpine}"

supa() { (cd "$ROOT" && npx supabase "$@"); }
psql_on() {
  local url="$1"; shift
  docker run --rm -i --network host -v "$BACKUP:/work" -v "$ROOT/scripts/vps:/scripts:ro" -w /work "$PG_IMAGE" \
    psql --no-psqlrc --variable ON_ERROR_STOP=1 --dbname "$url" "$@"
}

dump() {
  echo "── Dumping the hosted database into $BACKUP"
  supa db dump --db-url "$OLD_DB_URL" -f "$BACKUP/roles.sql" --role-only
  supa db dump --db-url "$OLD_DB_URL" -f "$BACKUP/schema.sql"
  supa db dump --db-url "$OLD_DB_URL" -f "$BACKUP/data.sql" --use-copy --data-only \
    -x "storage.buckets_vectors,storage.vector_indexes"
  supa db dump --db-url "$OLD_DB_URL" -f "$BACKUP/history_schema.sql" --schema supabase_migrations
  supa db dump --db-url "$OLD_DB_URL" -f "$BACKUP/history_data.sql" --use-copy --data-only --schema supabase_migrations

  # Known clashes with a self-hosted database (see the Supabase guide): objects owned by supabase_admin
  # stay owned by whoever restores them, and the CLI's login role is not granted postgres.
  sed -i -E 's/^(ALTER .* OWNER TO "supabase_admin";)$/-- \1/' "$BACKUP/schema.sql"
  sed -i -E 's/^(GRANT "postgres" TO "cli_login_postgres".*)$/-- \1/' "$BACKUP/roles.sql"
  ls -lh "$BACKUP"
}

restore() {
  echo "── Restoring into the VPS database (one transaction: all or nothing)"
  # Extensions the schema uses; Supabase's image ships them, they just need turning on.
  psql_on "$NEW_DB_URL" --command 'create extension if not exists pg_cron; create extension if not exists pg_net;'
  psql_on "$NEW_DB_URL" --single-transaction \
    --file roles.sql \
    --file schema.sql \
    --command 'SET session_replication_role = replica' \
    --file data.sql
  echo "── Migration history (so future 'supabase db push' knows what's applied)"
  psql_on "$NEW_DB_URL" --single-transaction --file history_schema.sql --file history_data.sql
}

post() {
  echo "── Vault secrets, cron jobs and links to stored files"
  psql_on "$NEW_DB_URL" \
    --variable "old_api_url=$OLD_API_URL" \
    --variable "new_api_url=$NEW_API_URL" \
    --variable "new_service_key=$NEW_SERVICE_KEY" \
    --file /scripts/post-restore.sql
}

storage() {
  echo "── Copying Storage files"
  (cd "$ROOT" && node --env-file="$ENV_FILE" scripts/vps/copy-storage.mjs)
}

# Row counts per table in public and auth, on both sides; any difference is printed.
COUNT_SQL="select table_schema || '.' || table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
from information_schema.tables
where table_schema in ('public', 'auth', 'storage') and table_type = 'BASE TABLE'
order by 1"

verify() {
  echo "── Comparing row counts (hosted vs VPS)"
  psql_on "$OLD_DB_URL" --tuples-only --no-align --field-separator ' ' --command "$COUNT_SQL" > "$BACKUP/counts-old.txt"
  psql_on "$NEW_DB_URL" --tuples-only --no-align --field-separator ' ' --command "$COUNT_SQL" > "$BACKUP/counts-new.txt"
  if diff "$BACKUP/counts-old.txt" "$BACKUP/counts-new.txt"; then
    echo "All $(wc -l < "$BACKUP/counts-old.txt") tables match."
  else
    echo "Counts differ (left: hosted, right: VPS). Rows written to the hosted project after the dump also show here."
    exit 1
  fi
  psql_on "$NEW_DB_URL" --command "select jobname, schedule, active from cron.job order by jobname"
}

case "${1:-}" in
  dump) dump ;;
  restore) restore ;;
  post) post ;;
  storage) storage ;;
  verify) verify ;;
  all) dump; restore; post; storage; verify ;;
  *) echo "Usage: $0 all | dump | restore | post | storage | verify"; exit 1 ;;
esac
