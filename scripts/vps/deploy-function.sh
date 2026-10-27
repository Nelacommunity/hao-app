#!/usr/bin/env bash
# Deploys the Edge Functions in supabase/functions to self-hosted Supabase on the VPS. `supabase functions
# deploy` only works with hosted projects; self-hosted runs whatever is in supabase/docker/volumes/functions.
#
#   scripts/vps/deploy-function.sh          # copy the code, restart the functions container, check it boots
#
# Copies every function folder (main/ on the VPS, the router, is left alone) and shared/. The functions
# import ../../../shared/..., which is outside the folder the container mounts, so shared/ goes to
# volumes/functions/_shared and the copied functions import ../_shared/... instead. No change to the
# VPS's docker-compose.yml is needed.
# Secrets (QWEN_API_KEY, AMAP_KEY, …) live in the VPS's .env and the functions service's environment.
#
# Needs VPS_SSH and VPS_DOCKER_DIR in .env.vps.local (see scripts/vps/vps.env.example), and ssh + rsync.
# VPS_FUNCTIONS_SERVICE names the compose service (default: functions, as in Supabase's docker-compose.yml).
# Under Coolify, set VPS_FUNCTIONS_CONTAINER instead (`docker ps` shows it, e.g. functions-<uuid>): the
# container is then restarted directly, leaving the compose project to Coolify.
# With NEW_API_URL and NEW_SERVICE_KEY set too, it checks the functions answer after the restart.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env.vps.local}"
[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE (copy scripts/vps/vps.env.example)"; exit 1; }
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
for name in VPS_SSH VPS_DOCKER_DIR; do
  [ -n "${!name:-}" ] || { echo "$name is not set in $ENV_FILE"; exit 1; }
done
FUNCTIONS_SERVICE="${VPS_FUNCTIONS_SERVICE:-functions}"

on_vps() { ssh "$VPS_SSH" "cd '$VPS_DOCKER_DIR' && $*"; }

FUNCTIONS=()
for dir in "$ROOT"/supabase/functions/*/; do
  name="$(basename "$dir")"
  [ "$name" = main ] && { echo "Skipping supabase/functions/main: the VPS's router has that name"; continue; }
  [ "$name" = _shared ] && { echo "Skipping supabase/functions/_shared: shared/ is copied there"; continue; }
  FUNCTIONS+=("$name")
done
[ ${#FUNCTIONS[@]} -gt 0 ] || { echo "No functions in supabase/functions"; exit 1; }

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
for name in "${FUNCTIONS[@]}"; do
  cp -R "$ROOT/supabase/functions/$name" "$STAGE/$name"
  find "$STAGE/$name" -name '*.ts' -exec sed -i "s#'\.\./\.\./\.\./shared/#'../_shared/#g" {} +
done

echo "── Copying ${FUNCTIONS[*]} and shared/"
for name in "${FUNCTIONS[@]}"; do
  rsync -az --delete "$STAGE/$name/" "$VPS_SSH:$VPS_DOCKER_DIR/volumes/functions/$name/"
done
rsync -az --delete --exclude node_modules --exclude '*.test.ts' --exclude package.json "$ROOT/shared/" "$VPS_SSH:$VPS_DOCKER_DIR/volumes/functions/_shared/"

if [ -n "${VPS_FUNCTIONS_CONTAINER:-}" ]; then
  echo "── Restarting the $VPS_FUNCTIONS_CONTAINER container"
  # Picks up the new code; changes to its environment or volumes go through a redeploy in Coolify.
  on_vps "docker restart '$VPS_FUNCTIONS_CONTAINER' > /dev/null"
else
  echo "── Restarting the $FUNCTIONS_SERVICE service"
  # up -d (not restart) so changes to its environment or volumes in docker-compose.yml apply too.
  on_vps "docker compose up -d --force-recreate '$FUNCTIONS_SERVICE'"
fi

if [ -z "${NEW_API_URL:-}" ] || [ -z "${NEW_SERVICE_KEY:-}" ]; then
  echo "Deployed. Set NEW_API_URL and NEW_SERVICE_KEY to have the script check the functions boot."
  exit 0
fi

# A GET does no work (the functions only take POST) but needs the function to boot, so a missing
# import or a syntax error shows up here as a 5xx instead of at 02:00 in the cron job.
echo "── Checking each function boots"
failed=0
for name in "${FUNCTIONS[@]}"; do
  status=000
  for _ in $(seq 1 15); do
    status="$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $NEW_SERVICE_KEY" "${NEW_API_URL%/}/functions/v1/$name" || true)"
    [ "$status" = 000 ] || [ "$status" = 502 ] || [ "$status" = 503 ] || break
    sleep 2
  done
  if [ "$status" -ge 500 ] || [ "$status" = 000 ]; then
    echo "$name: HTTP $status"
    failed=1
  else
    echo "$name: up (HTTP $status)"
  fi
done
if [ "$failed" = 1 ]; then
  if [ -n "${VPS_FUNCTIONS_CONTAINER:-}" ]; then
    echo "See the logs: ssh $VPS_SSH docker logs --tail 100 $VPS_FUNCTIONS_CONTAINER"
  else
    echo "See the logs: ssh $VPS_SSH \"cd '$VPS_DOCKER_DIR' && docker compose logs --tail 100 $FUNCTIONS_SERVICE\""
  fi
  exit 1
fi
echo "Deployed. For a full test run (it calls Qwen, so it costs):"
echo "  curl -X POST ${NEW_API_URL%/}/functions/v1/generate-stories -H \"Authorization: Bearer \$NEW_SERVICE_KEY\" -H 'Content-Type: application/json' -d '{\"dry_run\":true}'"
