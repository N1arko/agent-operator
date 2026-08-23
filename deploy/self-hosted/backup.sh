#!/bin/sh
set -eu

# @spec spec://modules/coordinator/INFRA-001-coordinator-runtime#data
base_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec "$base_dir/aopctl.sh" backup create
