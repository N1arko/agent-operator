#!/bin/sh
set -eu

# @spec spec://modules/coordinator/INFRA-001-coordinator-runtime#rollout
base_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
manifest=${1:-}
confirmation=${2:-}
if [ -z "$manifest" ] || [ "$confirmation" != "--confirm" ]; then
  echo "Usage: $0 MANIFEST --confirm" >&2
  exit 1
fi

case "$manifest" in
  /data/backups/*) container_manifest=$manifest ;;
  /*)
    echo "Manifest must be a backup basename or a /data/backups path." >&2
    exit 1
    ;;
  *) container_manifest="/data/backups/$manifest" ;;
esac

"$base_dir/compose.sh" stop coordinator
if "$base_dir/aopctl.sh" backup restore "$container_manifest" --confirm-stopped; then
  "$base_dir/compose.sh" start coordinator
  "$base_dir/aopctl.sh" doctor --json --offline
else
  "$base_dir/compose.sh" start coordinator
  exit 1
fi
