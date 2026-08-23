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

- [x] Production audit имеет zero high/critical.
- [x] Typecheck/lint/tests проходят после dependency changes.
- [x] License/community/security files согласованы и доступны.
- [x] Current tree и history scan имеют сохранённый redacted receipt.
- [x] Личные product-surface references перечислены с безопасным планом migration.
- [x] `TD-003` закрыт либо обновлён точным remaining risk.

## Result

Dependency graph обновлён и проходит production audit без известных
уязвимостей. Добавлены Apache-2.0, community/security files, Dependabot и
минимальный pinned security workflow. Gitleaks `8.30.1` проверил exact revision
`b3da50e818d89167187e5f09d6edd18665b59a8f`: 38 history commits и 173 файла
tracked tree, findings — 0. Personal deployment references классифицированы;
их migration закреплён за `WI-006`, `WI-007`, `WI-009`, final scan — за
`WI-010`. Полный прогон: 45/45 tests, typecheck/lint/spec lint green.
