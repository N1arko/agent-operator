# Compatibility and limitations

[Русская версия](COMPATIBILITY.ru.md)

## Release matrix

`v0.2.0-alpha` uses one version across coordinator, worker packages, health,
manifests, image labels, and release receipt.

| Component | Supported release boundary | Evidence before final publication |
|---|---|---|
| Coordinator | Linux container, `amd64` and `arm64`, Docker Compose v2 | Multi-architecture OCI build and Trivy scan on Ubuntu 24.04 |
| macOS worker | Apple Silicon macOS with Node.js 24 | Full lifecycle smoke on `macos-26-arm64`; clean-room host gate required |
| Windows worker | 64-bit Windows user session with Node.js 24 | Full lifecycle smoke on Windows Server 2025 x64; clean-room host gate required |
| Codex | Current official CLI/Desktop exposing `codex --version`, `codex mcp`, and compatible app-server/Desktop IPC; acceptance baseline CLI `0.149.0` | Exact public build recorded by final clean-room receipt |

The final release receipt is authoritative for exact OS, architecture, Node,
Codex, image digest, and package checksums observed during clean-room
acceptance.

## Compatibility rules

- Install coordinator and workers from the same release version.
- A worker package validates its platform, Node major version, file manifest,
  and coordinator compatibility before cutover.
- Update keeps configuration and durable state and retains one previous runtime
  for rollback.
- Read release notes before each alpha update. Internal Codex app-server and
  Desktop IPC changes can require a new Agent Operator release.
- Desktop and an external `codex` executable can update independently. Verify
  the executable resolved from the worker service user with `codex --version`.
- Native package signing and notarization are absent in alpha. Verify
  `SHA256SUMS` and release provenance before execution.

## Known limitations

- One deployment is one trust domain. Registered devices can send work to each
  other and see safe presence and project descriptors.
- One worker executes one active turn. Up to three executable requests may be
  outstanding for that worker.
- Coordinator administration uses local shell scripts. There is no web admin
  interface or remote enrollment administration API.
- Temporary files are limited to 10 MiB each, 50 MiB per owner, 20 attachments
  per message, and a 24-hour TTL.
- Worker packages are archives with lifecycle scripts. They are not PKG, MSI,
  App Store, or Microsoft Store packages.
- The coordinator has no hosted multi-tenant isolation, organization roles,
  schedules, or automatic orchestration.
- A public HTTPS endpoint requires operator-managed DNS, firewall, host
  security, monitoring, and backups.
- Alpha support follows the exact combinations in the current release receipt.
  Other OS versions and architectures may work and remain unverified.

## Update policy

The newest published `0.2.x` alpha receives security and compatibility fixes.
Historical alpha artifacts remain immutable. A failed release candidate gets a
new version and tag.
