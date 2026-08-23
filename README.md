# Agent Operator

[Русская версия](README.ru.md)

Agent Operator is a free, self-hosted coordination channel for Codex agents on
your own computers and accounts. One small coordinator carries presence,
mailbox messages, task results, and temporary files. A local worker keeps each
Codex session and source tree on its own machine.

> **Alpha:** the public line starts with `v0.2.0-alpha`. Read the
> [compatibility matrix](docs/getting-started/COMPATIBILITY.md) and
> [known limitations](docs/getting-started/COMPATIBILITY.md#known-limitations)
> before installation.

## What it does

- lists connected agents and path-free project descriptors;
- starts a fresh Codex task in a selected remote project;
- continues a known or recently discovered Codex task;
- sends serialized follow-ups, progress, cancellation, and final results;
- transfers committed Git files or bounded temporary attachments;
- keeps one owner-controlled trust domain with per-device enrollment and
  revocation;
- installs, diagnoses, updates, rolls back, and removes workers on macOS and
  Windows;
- backs up and restores coordinator state.

```text
Codex + worker (macOS)  ──outbound HTTPS──┐
                                          ├── self-hosted coordinator
Codex + worker (Windows) ─outbound HTTPS──┘   SQLite + bounded file store
```

OpenAI credentials, source trees, absolute project paths, and complete local
task lists remain on worker hosts. See the [security and privacy model](docs/security/SECURITY-MODEL.md).

## Quick start

You need:

- a Linux `amd64` or `arm64` host with Docker Compose;
- a domain with ports 80/443, or a private network between all hosts;
- Node.js 24 and Codex on each macOS or Windows worker host;
- two devices for the first end-to-end task.

Follow the [Quick Start](docs/getting-started/QUICKSTART.md). It covers:

1. downloading and verifying release artifacts;
2. starting the coordinator with your own URL;
3. creating one-time enrollment codes;
4. installing macOS and Windows workers;
5. sending the first task and receiving its result.

## Documentation

- [Documentation index](docs/README.md)
- [Quick Start](docs/getting-started/QUICKSTART.md)
- [Coordinator guide](docs/getting-started/COORDINATOR.md)
- [Worker guide](docs/getting-started/WORKER.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Operations and recovery](docs/OPERATIONS.md)
- [Troubleshooting](docs/operations/TROUBLESHOOTING.md)
- [Security policy](SECURITY.md)
- [Contributing](CONTRIBUTING.md)

## Product boundary

The alpha supports one trusted group of owner-controlled devices. Each worker
runs one active Codex turn and has a bounded queue. Hosted multi-tenant use,
fine-grained roles, a web admin panel, schedules, app stores, native package
signing, and several simultaneous turns per worker are outside this release.

## Development

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm audit --prod --audit-level high
```

The project uses executable specifications under [`specs/`](specs/README.md).
Contributions are licensed under [Apache License 2.0](LICENSE).
