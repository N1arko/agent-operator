#!/bin/sh
set -eu

base_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
backup_dir="$base_dir/backups"
mkdir -p "$backup_dir"
exec 9>"$backup_dir/.backup.lock"
flock -n 9 || exit 0
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_path="$backup_dir/coordinator-$timestamp.sqlite"
sqlite3 "$base_dir/data/db/coordinator.sqlite" ".backup '$backup_path'"
integrity=$(sqlite3 "$backup_path" "PRAGMA integrity_check;")
if [ "$integrity" != "ok" ]; then
  rm -f "$backup_path"
  echo "SQLite backup integrity check failed" >&2
  exit 1
fi
find "$backup_dir" -type f -name 'coordinator-*.sqlite' -mtime +7 -delete
echo "$backup_path"
