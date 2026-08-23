#!/bin/sh
set -eu

# @spec spec://modules/distribution/INFRA-004-open-source-release#artifacts.worker
root_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
exec node "$root_dir/scripts/package-workers.mjs" macos
