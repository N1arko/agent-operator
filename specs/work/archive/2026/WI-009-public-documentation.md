# WI-009: Подготовить публичную документацию и product surface

- Kind: `implement`
- Canon action: `none`

## Outcome

Незнакомый пользователь получает полный русский и английский путь от README до install, first task, operations, troubleshooting, update и uninstall без personal infrastructure references.

## Specs

- Governing: `spec://common/PROP-007-OPEN-SOURCE#documentation`
- Governing: `spec://modules/distribution/INFRA-004-open-source-release#deployment`
- Constraint: `spec://modules/distribution/INFRA-004-open-source-release#security`

## Scope

- In: README EN/RU, Quick Start, architecture/trust model, coordinator/worker guides, security/privacy, operations, troubleshooting, compatibility, migration, contribution templates, link validation.
- Out: final publication and external announcement.

## Dependencies

- Depends on: `WI-008`

## Acceptance

- [x] EN/RU release-critical paths семантически совпадают.
- [x] Все команды выполняются из public artifacts и placeholders.
- [x] Personal endpoint/path/identity отсутствуют в current product surface.
- [x] Security/data flow/limitations описаны проверяемо.
- [x] Links, examples и clean checkout docs tests проходят.

## Result

Accepted 2026-08-23 на implementation revision
`1995940bbf25a2ab5c5ef34a7b3a7b2830bf2476`. Публичная поверхность содержит
32 документа и 11 синхронизированных EN/RU пар; link/private-reference checker,
clean-checkout docs test, 65 тестов, CI и Security baseline прошли. Полная
запись: `docs/evidence/public-documentation-WI-009.json`.
