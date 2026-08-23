# WI-006: Выпустить generic self-hosted coordinator

- Kind: `migration`
- Canon action: `direct-edit`

## Outcome

Новый пользователь разворачивает coordinator и operator CLI на чистом Docker host с собственным URL без project-specific файлов и ручных правок source.

## Specs

- Governing: `spec://modules/distribution/INFRA-004-open-source-release#deployment`
- Governing: `spec://modules/coordinator/INFRA-001-coordinator-runtime#root`
- Constraint: `spec://modules/coordinator/FEAT-007-device-enrollment#contracts.cli`
- Affected: `spec://common/PROP-002-STACK#environments`

## Scope

- In: generic image/compose/Caddy/env, health revision, data permissions, aopctl, backup/restore/doctor, TLS/private-network profiles, migration existing deployment.
- Out: worker packages, GHCR publication и public repository switch.

## Dependencies

- Depends on: `WI-005`

## Acceptance

- [ ] Fresh Linux Docker host проходит documented bootstrap.
- [ ] URL/domain/identities не зашиты в product files.
- [ ] Health, enrollment CLI, persistence и restart проходят.
- [ ] Backup/restore возвращает devices, queue и schema integrity.
- [ ] Current private production имеет безопасный migration/rollback path.

## Result

Заполняется при завершении.
