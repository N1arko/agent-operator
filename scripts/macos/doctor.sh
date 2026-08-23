#!/bin/sh
set -eu

package_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
exec node "$package_root/bin/workerctl.mjs" doctor "$@"
