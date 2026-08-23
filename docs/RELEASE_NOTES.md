# Agent Operator v0.2.0-alpha

[Русская версия](RELEASE_NOTES.ru.md)

This is the first free self-hosted open-source release line.

## Included

- multi-architecture Linux coordinator image and generic Docker Compose/Caddy
  bundle;
- one-time device enrollment, device list, and immediate credential revocation;
- versioned macOS and Windows worker lifecycle packages;
- Codex MCP and `coordinate-agents` skill integration;
- agent/project/task discovery, new tasks, exact-task continuation, serialized
  follow-ups, progress, cancellation, and final results;
- committed Git files and bounded temporary attachments;
- coordinator backup/restore and worker update/rollback/uninstall;
- checksums, SPDX SBOMs, image scan, provenance, and release receipt.

## Migration

Fresh deployments use enrollment codes. Private `0.1.23` deployments can use
the documented migration-only legacy token compatibility path. Follow the
[migration guide](getting-started/MIGRATION.md).

## Compatibility

See the [compatibility matrix](getting-started/COMPATIBILITY.md). The final
release receipt records the exact clean-room hosts, Codex versions, image
digest, and package hashes.

## Known limitations

The alpha serves one owner-controlled trust domain, runs one active turn per
worker, depends on internal Codex app-server/Desktop IPC compatibility, and
ships archive-based unsigned worker packages. The complete list is in
[Compatibility and limitations](getting-started/COMPATIBILITY.md#known-limitations).

## Verification

Download `SHA256SUMS`, verify each artifact before execution, and compare image
and source provenance with the release receipt. Public signed attestations and
clean-room evidence are release gates for the final `v0.2.0-alpha` publication.
