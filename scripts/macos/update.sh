#!/bin/sh
set -eu

# @spec spec://modules/worker/INFRA-003-release-and-recovery#recovery
package_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
exec node "$package_root/bin/workerctl.mjs" update --package-root "$package_root" "$@"
