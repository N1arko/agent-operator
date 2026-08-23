# Troubleshooting

[Русская версия](TROUBLESHOOTING.ru.md)

Start with exact version and local doctor output. Redact tokens, enrollment
codes, prompts, results, project paths, and file contents before sharing logs.

## Coordinator does not become healthy

```sh
./compose.sh config --quiet
./compose.sh ps
./compose.sh logs --tail=200 coordinator
./aopctl.sh doctor --json --offline
```

Check that `.env` has a valid `AOP_PUBLIC_URL`, exact `AOP_ALLOWED_HOSTS`, a
release `AOP_IMAGE`, and current `AOP_UID`/`AOP_GID`. Verify write access to
`data/`, available disk space, and image architecture support.

## HTTPS or host validation fails

- Confirm DNS resolves to the coordinator host.
- Allow inbound TCP 80/443 for Caddy certificate issuance.
- Set `AOP_DOMAIN` to the DNS name without scheme or path.
- Set `AOP_ALLOWED_HOSTS` to the host sent by clients.
- Inspect Caddy: `./compose.sh logs --tail=200 caddy`.
- For a private HTTP profile, bind only to the private interface and use the
  same address in `AOP_PUBLIC_URL` and `AOP_ALLOWED_HOSTS`.

## Enrollment is denied

Create a new code and use it within 10 minutes:

```sh
./aopctl.sh device create --id dev-mac-2 --name "Development Mac"
```

Codes are single-use. Unknown, expired, consumed, and revoked codes return the
same public denial shape. Check local coordinator time, URL reachability, and
worker package version. Choose a new agent ID when the previous identity was
already enrolled or revoked.

## Worker doctor fails

Check:

```sh
node --version
codex --version
```

Then run the platform doctor. Confirm the configured project directories still
exist and are readable, the coordinator URL is reachable from the user
session, and the service uses the same Node/Codex installation as the terminal.

On macOS, inspect the LaunchAgent and local worker error log under the install
root. On Windows, inspect Scheduled Task last result and the current-user
install root. Avoid copying complete logs into a public issue.

## Agent is offline

An agent becomes offline after 45 seconds without heartbeat. Run local doctor,
restart the worker service, and inspect coordinator device list. A revoked
credential requires a new explicit enrollment. A network failure usually
appears before message polling starts.

## Codex cannot see Agent Operator tools

1. Restart Codex after installation or update.
2. Run `codex mcp get agent-operator` in the same user context.
3. Confirm the bundled `coordinate-agents` skill exists in the active Codex
   home.
4. Run worker doctor.
5. If an unmanaged MCP entry existed before install, remove it explicitly and
   rerun integration install/update.

## Task stays queued or active

- Read agent status and the current activity.
- Wait with the cursor returned by the original request.
- Reuse the same idempotency key only when the original submission outcome is
  unknown.
- Cancel an obsolete request by its exact message ID.
- Check request lease and worker heartbeat.
- Restarting a worker preserves pending state; avoid creating duplicate tasks.

## Update or rollback fails

Verify the newly downloaded package checksum and manifest. Update must run from
the new package. Rollback requires one retained previous runtime. Run doctor
before service cutover and after rollback. Keep config and durable state until
the result is verified.

## Backup restore fails

Keep coordinator stopped for direct restore. Pass a manifest basename from
`data/backups/` or its `/data/backups/...` container path. A checksum, SQLite
integrity, or credential-key mismatch rejects restore. Preserve both current
and candidate backup sets for diagnosis.

## Report a problem

Use the repository bug template with version, component, minimal reproduction,
expected result, and redacted observed output. Use
[private vulnerability reporting](../../SECURITY.md) for security issues.
