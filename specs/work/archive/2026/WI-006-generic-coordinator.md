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

- [x] Fresh Linux Docker host проходит documented bootstrap.
- [x] URL/domain/identities не зашиты в product files.
- [x] Health, enrollment CLI, persistence и restart проходят.
- [x] Backup/restore возвращает devices, queue и schema integrity.
- [x] Current private production имеет безопасный migration/rollback path.

## Result

Generic self-hosted coordinator реализован в commit
`98b7623102c48a4f35d73596a5c0db083e94ee09`. Документированный bootstrap
проверен на отдельном Linux Docker-in-Docker host; образ запускается от UID
1000 с read-only application filesystem, health сообщает точную revision,
doctor подтверждает SQLite и owner-only credential key. Локальный lifecycle
покрыл enrollment, restart, backup, revoke и restore. Trivy не обнаружил
High/Critical уязвимостей в runtime image, Gitleaks не обнаружил секретов в
истории и tracked tree. Существующий private production не изменялся; staged
migration и rollback через `v0.1.23` описаны в
`docs/getting-started/MIGRATION.ru.md`. Полная запись приёмки:
`docs/evidence/generic-coordinator-WI-006.json`.
