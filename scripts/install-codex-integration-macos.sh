#!/bin/sh
set -eu

root_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
env_file=${1:-"$root_dir/.env.mac"}
codex_bin=${2:-"/Applications/ChatGPT.app/Contents/Resources/codex"}
codex_home=${CODEX_HOME:-"$HOME/.codex"}
codex_env_file="$codex_home/.env"
skill_source="$root_dir/integrations/skills/coordinate-agents"
skill_target="$codex_home/skills/coordinate-agents"

set -a
. "$env_file"
set +a

launchctl setenv AOP_DEVICE_TOKEN "$AOP_DEVICE_TOKEN"
mkdir -p "$codex_home"
codex_env_temp=$(mktemp "$codex_env_file.tmp.XXXXXX")
trap 'rm -f "$codex_env_temp"' EXIT HUP INT TERM
awk '
  BEGIN { written = 0 }
  /^[[:space:]]*(export[[:space:]]+)?AOP_DEVICE_TOKEN=/ {
    if (!written) {
      print "AOP_DEVICE_TOKEN=" ENVIRON["AOP_DEVICE_TOKEN"]
      written = 1
    }
    next
  }
  { print }
  END {
    if (!written) {
      print "AOP_DEVICE_TOKEN=" ENVIRON["AOP_DEVICE_TOKEN"]
    }
  }
' "${codex_env_file:-/dev/null}" 2>/dev/null >"$codex_env_temp" || {
  awk '
    BEGIN {
      print "AOP_DEVICE_TOKEN=" ENVIRON["AOP_DEVICE_TOKEN"]
    }
  ' >"$codex_env_temp"
}
chmod 600 "$codex_env_temp"
mv "$codex_env_temp" "$codex_env_file"
trap - EXIT HUP INT TERM

if "$codex_bin" mcp get agent-operator >/dev/null 2>&1; then
  "$codex_bin" mcp remove agent-operator >/dev/null
fi
"$codex_bin" mcp add agent-operator \
  --url "https://agent-operator.188-241-197-83.sslip.io/mcp" \
  --bearer-token-env-var AOP_DEVICE_TOKEN >/dev/null

mkdir -p "$skill_target"
cp -R "$skill_source/." "$skill_target/"

echo "Agent Operator MCP and coordinate-agents skill configured for Codex."
echo "In Codex Desktop, open Settings > MCP servers and restart the local app-server."
