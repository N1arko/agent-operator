# Coordinator guide

[Русская версия](COORDINATOR.ru.md)

The coordinator is a small HTTP/MCP service with SQLite and a bounded temporary
file store. Run it on a Linux host with Docker Compose. All worker connections
are outbound from their hosts.

## Release bundle

Download `agent-operator-self-hosted-VERSION.tar.gz` and `SHA256SUMS` from the
same GitHub Release. Verify the archive before extraction. The release bundle
contains an exact `ghcr.io/n1arko/agent-operator:VERSION` image reference,
Compose profiles, Caddy, operator scripts, and a file manifest.

Run `./bootstrap.sh` once to create `.env`. Review it before the second run.
The generated `.env`, `data/`, credentials, SQLite files, and backups stay on
the host and are excluded from Git.

## Public HTTPS profile

Point an A/AAAA record at the Linux host and allow inbound TCP 80/443. Set:

```dotenv
AOP_PUBLIC_URL=https://operator.example.com
AOP_ALLOWED_HOSTS=operator.example.com
AOP_TLS=true
AOP_DOMAIN=operator.example.com
```

`./bootstrap.sh` starts coordinator and Caddy. Caddy obtains and renews the TLS
certificate. Keep the coordinator port unexposed to the public network; Caddy
is the internet-facing service.

## Private-network profile

Use this profile when all hosts share a VPN or private LAN:

```dotenv
AOP_PUBLIC_URL=http://10.0.0.10:8787
AOP_ALLOWED_HOSTS=10.0.0.10
AOP_TLS=false
AOP_BIND_ADDRESS=10.0.0.10
AOP_HTTP_PORT=8787
```

Allow port 8787 only from the private network. Plain HTTP is intended for a
trusted private transport. Use the HTTPS profile for internet-routed traffic.

## Configuration

| Variable | Purpose |
|---|---|
| `AOP_IMAGE` | Exact coordinator image tag or digest |
| `AOP_PUBLIC_URL` | URL embedded in enrollment output and used by workers |
| `AOP_ALLOWED_HOSTS` | Comma-separated accepted HTTP Host values |
| `AOP_TLS` | Enables the Caddy Compose profile when `true` |
| `AOP_DOMAIN` | DNS name used by Caddy |
| `AOP_BIND_ADDRESS` | Host bind address for the base profile |
| `AOP_HTTP_PORT` | Host port for the base profile |
| `AOP_REQUEST_LEASE_MS` | Executable request lease; default two hours |
| `AOP_UID`, `AOP_GID` | Owner of bind-mounted coordinator data |
| `AOP_MEMORY_LIMIT`, `AOP_CPU_LIMIT` | Coordinator resource limits |

`bootstrap.sh` fills `AOP_UID` and `AOP_GID` from the current Linux user. The
container runs without root capabilities, with a read-only root filesystem and
`no-new-privileges`.

## Device administration

Operator commands run locally through the same image and data directory:

```sh
./aopctl.sh device create --id dev-mac --name "Development Mac"
./aopctl.sh device list
./aopctl.sh device list --json
./aopctl.sh device revoke dev-mac
./aopctl.sh enrollment revoke ENROLLMENT_ID
```

Enrollment codes expire after 10 minutes, are accepted once, and are stored as
keyed digests. A successful worker receives its device credential once.
Revocation rejects subsequent device requests and keeps existing mailbox data
for operator diagnosis.

## Data and health

Persistent data lives under `self-hosted/data/`:

- `coordinator.sqlite` — agents, devices, mailbox, task and file metadata;
- `credential.key` — server-side key for credential digests;
- `files/` — bounded temporary file content;
- `backups/` — operator-created backup sets.

Useful checks:

```sh
./compose.sh ps
./compose.sh logs --tail=100 coordinator
./aopctl.sh doctor --json
curl -fsS https://operator.example.com/health
```

See [operations](../OPERATIONS.md) for backup, restore, update, and rollback.
