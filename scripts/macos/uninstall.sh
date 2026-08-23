#!/bin/sh
set -eu

# @spec spec://modules/distribution/INFRA-004-open-source-release#worker-lifecycle
package_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
exec node "$package_root/bin/workerctl.mjs" uninstall "$@"
