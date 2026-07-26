#!/bin/sh
set -eu

base_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
backup_dir="$base_dir/backups"
mkdir -p "$backup_dir"
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
sqlite3 "$base_dir/data/db/coordinator.sqlite" \
  ".backup '$backup_dir/coordinator-$timestamp.sqlite'"
find "$backup_dir" -type f -name 'coordinator-*.sqlite' -mtime +7 -delete
