# Self-hosted coordinator

[Русская версия](README.ru.md)

This directory runs Agent Operator coordinator on a Linux Docker Compose host.
Local configuration lives in `.env`; runtime state lives in `data/`. Both are
excluded from Git.

## Release bundle

Run `./bootstrap.sh` once. It creates `.env` with user-only permissions and
exits. Set your own URL and host:

```dotenv
AOP_PUBLIC_URL=https://operator.example.com
AOP_ALLOWED_HOSTS=operator.example.com,127.0.0.1,localhost
AOP_TLS=true
AOP_DOMAIN=operator.example.com
```

Point DNS to this host and allow inbound TCP 80/443, then run:

```sh
./bootstrap.sh
./compose.sh ps
./aopctl.sh doctor --json
```

The release bundle already contains the exact GHCR image tag. Keep it unchanged
until an intentional, backed-up update.

## Source checkout

For local development:

```sh
cd deploy/self-hosted
./bootstrap.sh || test $? -eq 2
# edit .env
./bootstrap.sh --build
```

## Operator commands

```sh
./aopctl.sh device create --id dev-mac --name "Development Mac"
./aopctl.sh device list
./aopctl.sh device revoke dev-mac
./backup.sh
./restore.sh BACKUP_MANIFEST.json --confirm
./compose.sh restart coordinator
./compose.sh logs --tail=100 coordinator
./compose.sh down
```

Backup sets contain a manifest, SQLite snapshot, and credential key under
`data/backups/`. Restore verifies checksums and SQLite integrity and creates a
pre-restore backup before replacing state.

## Security

- `bootstrap.sh` sets container UID/GID to the current Linux user;
- `data/`, backup files, `.env`, and the credential key receive owner-only
  permissions;
- the container drops capabilities, uses `no-new-privileges`, and has a
  read-only root filesystem;
- public routing requires TLS, an exact allowed host, and a firewall;
- the base HTTP profile should bind to loopback or a private-network address.

Full documentation: <https://github.com/N1arko/agent-operator/tree/main/docs>.
