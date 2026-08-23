# WI-005: Реализовать enrollment и revoke устройств

- Kind: `implement`
- Canon action: `none`

## Outcome

Owner самостоятельно создаёт одноразовый code, worker получает отдельный credential, device отображается и отзывается без ручного редактирования общей token map.

## Specs

- Governing: `spec://modules/coordinator/FEAT-007-device-enrollment#root`
- Constraint: `spec://common/PROP-006-API#auth`
- Constraint: `spec://common/PROP-005-RUNTIME#recovery`

## Scope

- In: schema, hashing ADR, store/auth, consume endpoint, local aopctl create/list/revoke, legacy token compatibility, contract/concurrency/restart tests.
- Out: generic Docker deployment и worker installer UI.

## Dependencies

- Depends on: `WI-004`

## Acceptance

- [x] Concurrent consume выдаёт один credential.
- [x] Raw code/token отсутствуют в DB/logs/audit.
- [x] Enrolled identity проходит heartbeat и MCP.
- [x] Revoke блокирует следующий HTTP/MCP request.
- [x] Legacy tokens сохраняют текущий production path.
- [x] Backup/restart и error/rate-limit сценарии покрыты тестами.

## Result

В exact revision `de0d856b5ebb2a5ea7c3188aafdcbd986089df4c`
реализованы HMAC-hashed enrollment/device records, атомарный consume endpoint,
persistent auth и немедленный revoke для HTTP/MCP. Локальный `aopctl` создаёт,
перечисляет и отзывает devices/enrollments; legacy `AOP_DEVICE_TOKENS` остаётся
migration-only источником. Credential key создаётся с mode `0600` и переносится
вместе с SQLite при restore. Полный прогон — 55/55, focused enrollment cases —
26 x 3, production audit и Gitleaks — без findings. Evidence:
`docs/evidence/device-enrollment-WI-005.json`.
