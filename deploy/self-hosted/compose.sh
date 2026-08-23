#!/bin/sh
set -eu

# @spec spec://modules/distribution/INFRA-004-open-source-release#deployment
base_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$base_dir"

if [ ! -f .env ]; then
  echo "Missing $base_dir/.env. Copy .env.example and configure it first." >&2
  exit 1
fi

if grep -Eq '^AOP_TLS=true([[:space:]]*)$' .env; then
  exec docker compose --env-file .env \
    -f compose.yaml -f compose.tls.yaml "$@"
fi

exec docker compose --env-file .env -f compose.yaml "$@"
