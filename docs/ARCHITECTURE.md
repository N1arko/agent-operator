# Architecture

[Русская версия](ARCHITECTURE.ru.md)

## System shape

Agent Operator connects independent Codex installations through one self-hosted
mailbox and presence service.

```text
┌──────────────────────── macOS host ────────────────────────┐
│ Codex Desktop/CLI ← local app-server/IPC → worker          │
│ source tree · project paths · task index · device token    │
└───────────────────────────┬─────────────────────────────────┘
                            │ outbound HTTPS: heartbeat,
                            │ long poll, messages, files
                    ┌───────▼────────┐
                    │  coordinator   │
                    │ HTTP + MCP     │
                    │ SQLite + files │
                    └───────▲────────┘
                            │ outbound HTTPS
┌───────────────────────────┴─────────────────────────────────┐
│ Codex Desktop/CLI ← local app-server/IPC → worker          │
│ source tree · project paths · task index · device token    │
└──────────────────────── Windows host ───────────────────────┘
```

## Components

### Coordinator

- exposes authenticated MCP and worker HTTP endpoints;
- stores device records, safe agent presence, path-free project descriptors,
  mailbox messages, task bindings, progress, and terminal results in SQLite;
- atomically assigns queued messages to one worker process;
- applies request leases, idempotency, queue bounds, and cancellation;
- stores temporary files until acknowledgment or TTL;
- provides local `aopctl` enrollment, revoke, doctor, backup, and restore.

### Worker

- maintains heartbeat and a long-poll inbox through an outbound connection;
- resolves project IDs to local paths;
- creates or continues local Codex tasks;
- serializes one active turn and durable pending work;
- observes safe progress and returns one terminal result;
- installs the MCP endpoint and `coordinate-agents` skill for the local user;
- keeps source, complete task lists, absolute paths, and OpenAI credentials on
  the host.

### Codex integration

Codex calls coordinator MCP tools to discover agents and route work. The worker
uses the local Codex app-server and Desktop IPC to make the task visible on the
receiving host. The coordinator never calls OpenAI on behalf of a worker.

## Task flow

```text
caller Codex
  → agents_list / agent_projects
  → agent_start(idempotencyKey, agentId, projectId, prompt)
  → coordinator durable queue
  → recipient worker claims message
  → local Codex task and turn
  → progress updates
  → terminal completed | failed | cancelled result
  → agent_wait(cursor)
  → caller Codex
```

A follow-up uses `agent_send` with the exact prior message ID. Work in an exact
known Codex task uses `agent_thread_send`. One worker runs one active turn; its
coordinator backlog is bounded to three executable requests.

## Identity and enrollment

The owner creates a short-lived one-time enrollment code through local
`aopctl`. The coordinator stores a keyed digest. A successful consume creates a
separate device credential, returns it once, and records only its keyed digest
and safe hint. Revocation takes effect on the next request boundary.

## Files

- A committed repository file travels as repository, exact commit, relative
  path, and SHA-256. The receiving worker verifies all four before use.
- A local file travels as a temporary attachment with owner, recipient,
  filename, size, SHA-256, quota, and expiry. The worker acknowledges and
  deletes it after the task result.

## Persistence and failure recovery

Coordinator state and its credential key live in a bind-mounted data directory.
Worker configuration and durable state live outside versioned runtime
directories. Duplicate worker processes cannot execute the same delivery.
Unacknowledged deliveries return to the queue after a short lease. Update keeps
one prior runtime for rollback. Backup manifests bind SQLite and credential-key
checksums.

## Deployment boundary

The supported alpha deployment is one owner-controlled trust domain. Caddy can
terminate public TLS; a VPN/private-LAN profile can bind coordinator directly
to a private address. Hosted multi-tenant isolation requires a separate future
architecture.
