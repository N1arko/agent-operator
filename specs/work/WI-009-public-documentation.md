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

- [ ] EN/RU release-critical paths семантически совпадают.
- [ ] Все команды выполняются из public artifacts и placeholders.
- [ ] Personal endpoint/path/identity отсутствуют в current product surface.
- [ ] Security/data flow/limitations описаны проверяемо.
- [ ] Links, examples и clean checkout docs tests проходят.

## Result

Заполняется при завершении.
