#!/bin/sh
set -eu

# @spec spec://modules/coordinator/FEAT-007-device-enrollment#contracts.cli
base_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec "$base_dir/compose.sh" run --rm --no-deps coordinator \
  node dist/src/coordinator/aopctl.js "$@"
