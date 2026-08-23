# Security and privacy model

[Русская версия](SECURITY-MODEL.ru.md)

## Trust boundary

One deployment is one trust domain. The owner controls coordinator shell
access, DNS/TLS, firewall, backups, and device membership. Every registered
device is trusted to see safe presence and project descriptors and to send work
to other registered devices.

Use a separate deployment for users or devices that should not trust each
other.

## Data locations

| Data | Coordinator | Worker host |
|---|---:|---:|
| Device IDs, names, platform, version, heartbeat | yes | own identity |
| Project ID, display name, tags, availability | yes | yes |
| Absolute project path and source tree | no | yes |
| Request text, progress, result, task binding | yes | active/local copy |
| Complete local Codex task list | no | yes |
| OpenAI/Codex account credentials | no | yes |
| Device credential plaintext | returned once | yes |
| Device/enrollment keyed digest | yes | no |
| Temporary file bytes | until ack/TTL | during recipient task |

Coordinator SQLite and backup files can contain prompts, results, task IDs,
project display metadata, and delivery history. Protect them as private data.

## Authentication

- The operator creates enrollment codes through local `aopctl` only.
- Codes expire after 10 minutes and can be consumed once.
- Codes and device tokens are stored as server-keyed digests in SQLite.
- The plaintext device token is returned once and stored with user-only
  permissions on the worker.
- Revocation rejects future HTTP and MCP requests for that device.
- Authentication failures use bounded, generic responses for unknown,
  expired, consumed, and revoked enrollment codes.

## Network

Public routing requires HTTPS, an exact allowed host, restricted host access,
and a firewall. The packaged Caddy profile terminates TLS. The base HTTP
profile is suitable for loopback, a private LAN, a VPN, or an operator-managed
reverse proxy.

Workers initiate outbound heartbeat, long-poll, message, and file requests.
They do not require inbound ports.

## Containers and supply chain

The coordinator container runs as the configured host UID/GID with all Linux
capabilities dropped, `no-new-privileges`, a read-only root filesystem, bounded
resources, and a writable data mount. Release images use pinned base digests.

Every release provides `SHA256SUMS`, SPDX SBOMs, a vulnerability scan, build
provenance, and a release receipt tied to an immutable tag and commit. Verify
artifacts before use. Worker archives are unsigned in alpha.

## Retention and deletion

- Temporary file limit: 10 MiB per file, 50 MiB per owner, 20 attachments per
  message, 24-hour TTL.
- Downloaded temporary files are removed after terminal result; coordinator
  copies are removed after acknowledgment or TTL.
- Revocation preserves mailbox/task history for diagnosis.
- Worker uninstall preserves config and state unless explicit delete flags are
  supplied.
- Backup retention is an operator decision in alpha.

## Logs

Avoid debug logging of prompts, results, credentials, enrollment codes, local
paths, or file contents. Share only redacted logs in issues. Security reports
belong in [GitHub private vulnerability reporting](../../SECURITY.md).

## Threats outside the alpha model

The alpha has no tenant isolation, per-project authorization, fine-grained
roles, remote admin API, hardware-backed credential storage, or native worker
package signing. A compromised registered device can submit work inside the
trust domain. A compromised coordinator can read stored mailbox and temporary
file data and impersonate routing decisions.
