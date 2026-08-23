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

- [ ] Concurrent consume выдаёт один credential.
- [ ] Raw code/token отсутствуют в DB/logs/audit.
- [ ] Enrolled identity проходит heartbeat и MCP.
- [ ] Revoke блокирует следующий HTTP/MCP request.
- [ ] Legacy tokens сохраняют текущий production path.
- [ ] Backup/restart и error/rate-limit сценарии покрыты тестами.

## Result

Заполняется при завершении.
