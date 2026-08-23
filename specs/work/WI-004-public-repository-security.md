# WI-004: Подготовить security baseline публичного repository

- Kind: `implement`
- Canon action: `none`

## Outcome

Repository имеет лицензионный и security baseline, чистый production dependency graph и проверенный inventory истории, достаточные для дальнейшей публичной упаковки.

## Specs

- Governing: `spec://common/PROP-007-OPEN-SOURCE#community`
- Governing: `spec://modules/distribution/INFRA-004-open-source-release#security`
- Constraint: `spec://common/PROP-000-workflow#quality`

## Scope

- In: Apache-2.0, SECURITY/CONTRIBUTING/Code of Conduct, dependency updates, zero high/critical audit, secret/private-data/license inventory, security automation baseline.
- Out: изменение repository visibility, destructive history rewrite, enrollment и installers.

## Dependencies

- Depends on: `WI-003`

## Acceptance

- [ ] Production audit имеет zero high/critical.
- [ ] Typecheck/lint/tests проходят после dependency changes.
- [ ] License/community/security files согласованы и доступны.
- [ ] Current tree и history scan имеют сохранённый redacted receipt.
- [ ] Личные product-surface references перечислены с безопасным планом migration.
- [ ] `TD-003` закрыт либо обновлён точным remaining risk.

## Result

Заполняется при завершении.
