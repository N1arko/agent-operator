#!/bin/sh
set -eu
umask 077

base_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
env_file="$base_dir/.env"
secret_dir="$base_dir/secrets"
mkdir -p "$secret_dir" "$base_dir/data/db"
chown 1000:1000 "$base_dir/data/db"

if [ -f "$env_file" ]; then
  echo "Deployment secrets already exist."
  exit 0
fi

mac_token=$(openssl rand -hex 32)
windows_token=$(openssl rand -hex 32)

{
  echo "AOP_ALLOWED_HOSTS=agent-operator.188-241-197-83.sslip.io"
  echo "AOP_DEVICE_TOKENS=mac:$mac_token,windows:$windows_token"
} > "$env_file"
printf '%s\n' "$mac_token" > "$secret_dir/mac.token"
printf '%s\n' "$windows_token" > "$secret_dir/windows.token"

echo "Deployment secrets created."
