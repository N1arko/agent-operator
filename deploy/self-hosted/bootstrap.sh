#!/bin/sh
set -eu
umask 077

# @spec spec://modules/distribution/INFRA-004-open-source-release#deployment
base_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$base_dir"

command -v docker >/dev/null 2>&1 || {
  echo "Docker is required." >&2
  exit 1
}
docker compose version >/dev/null

if [ ! -f .env ]; then
  cp .env.example .env
  current_uid=$(id -u)
  current_gid=$(id -g)
  awk -v uid="$current_uid" -v gid="$current_gid" '
    /^AOP_UID=/ { print "AOP_UID=" uid; next }
    /^AOP_GID=/ { print "AOP_GID=" gid; next }
    { print }
  ' .env > .env.bootstrap
  mv .env.bootstrap .env
  echo "Created $base_dir/.env. Review URL, allowed hosts and TLS settings, then run bootstrap again." >&2
  exit 2
fi

mkdir -p data/files data/backups
chmod 700 data data/files data/backups
"$base_dir/compose.sh" config --quiet

if [ "${1:-}" = "--build" ]; then
  "$base_dir/compose.sh" -f compose.build.yaml build coordinator
fi

"$base_dir/compose.sh" up -d
container_id=$("$base_dir/compose.sh" ps -q coordinator)
if [ -z "$container_id" ]; then
  echo "Coordinator container was not created." >&2
  exit 1
fi

attempt=0
while [ "$attempt" -lt 30 ]; do
  health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id")
  if [ "$health" = "healthy" ]; then
    "$base_dir/aopctl.sh" doctor --json --offline
    exit 0
  fi
  if [ "$health" = "unhealthy" ] || [ "$health" = "exited" ]; then
    "$base_dir/compose.sh" logs --tail=100 coordinator >&2
    exit 1
  fi
  attempt=$((attempt + 1))
  sleep 1
done

echo "Coordinator did not become healthy within 30 seconds." >&2
"$base_dir/compose.sh" logs --tail=100 coordinator >&2
exit 1
