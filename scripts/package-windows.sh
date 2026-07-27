#!/bin/sh
set -eu

root_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
stage_dir="$root_dir/work/windows-package"
archive="$root_dir/release/agent-operator-worker-0.1.7.zip"

rm -rf "$stage_dir"
mkdir -p "$stage_dir/dist" "$stage_dir/scripts" "$root_dir/release"
cp -R "$root_dir/dist/src" "$stage_dir/dist/"
cp "$root_dir/package.json" "$stage_dir/"
cp "$root_dir/scripts/windows/"*.ps1 "$stage_dir/"
cp "$root_dir/docs/CHECKPOINT_WINDOWS.md" "$stage_dir/"
cp "$root_dir/docs/UPDATE_WINDOWS_0.1.7.md" "$stage_dir/"

cd "$stage_dir"
rm -f "$archive"
zip -qr "$archive" .
echo "$archive"
