# Migration from private 0.1.23

[Русская версия](MIGRATION.ru.md)

The `0.1.23` line is a historical private deployment. Move to the generic
`v0.2.0-alpha` profile through a staged cutover with an exact backup.

## Prepare

1. Record the current source/image revision and worker versions.
2. Create and verify a SQLite snapshot and preserve the legacy token map in the
   operator's private credential store.
3. Download and verify the `v0.2.0-alpha` self-hosted bundle.
4. Copy the snapshot into an isolated staging data directory.
5. Configure the generic bundle with the existing public URL and an exact
   allowed host.
6. Start it on a separate loopback/private port and run `aopctl doctor`.

The first generic startup creates `credential.key` and adds enrollment/device
tables. `AOP_DEVICE_TOKENS` remains a migration-only compatibility source for
the alpha line. New installations use one-time enrollment.

## Cut over

1. Stop writes to the old coordinator and create the final pre-cutover backup.
2. Start the generic coordinator with the final database and staged
   `credential.key`.
3. Verify health, one legacy heartbeat, MCP access, and one vertical request.
4. Switch the edge route.
5. Create a fresh enrollment for each host and update its worker one at a time.
6. Verify heartbeat and a control task, then revoke/remove the corresponding
   legacy credential.
7. Remove `AOP_DEVICE_TOKENS` after every identity is migrated.

## Roll back

Restore the old edge route and immutable `0.1.23` runtime. Use the
pre-migration SQLite snapshot. Keep the migrated database separately for
diagnosis. Re-enrolled workers need their legacy credential restored from the
operator's private store before reconnecting to the old coordinator.

Never mix databases or `credential.key` files from different staged attempts.
Use [backup and restore](../OPERATIONS.md#backup-and-restore) for the generic
profile.
