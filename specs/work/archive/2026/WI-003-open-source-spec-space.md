# WI-003: Принять канон open-source v0.2

- Kind: `change`
- Canon action: `new-spec`

## Outcome

Agent Operator имеет активный и непротиворечивый spec-space для бесплатного self-hosted open-source релиза `v0.2.0-alpha`, device enrollment и публичной supply chain, достаточный для независимых инженерных WI.

## Specs

- Governing: `spec://common/PROP-000-workflow#workflow`
- Affected: `spec://common/main#scope`
- New: `spec://common/PROP-007-OPEN-SOURCE#root`
- New: `spec://modules/coordinator/FEAT-007-device-enrollment#root`
- New: `spec://modules/distribution/PROP-102-distribution#root`
- New: `spec://modules/distribution/INFRA-004-open-source-release#root`

## Scope

- In: продуктовая граница одного trust domain, поддерживаемые release surfaces, enrollment/revoke contract, migration legacy tokens, GitHub/GHCR/Release supply chain, clean-room gates, регистрация в `SPEC-MAP` и `structure.md`.
- Out: реализация API/CLI/installers/workflows, изменение production, публикация GitHub repository.
- Preserve: действующий `0.1.23`, локальные credentials и данные, текущий закрытый deployment.

## Acceptance

- [x] Четыре новые спеки имеют однозначный ownership, active lifecycle и точные связи.
- [x] Self-hosted trust-domain и hosted multi-tenant границы сформулированы явно.
- [x] Enrollment, list, revoke и legacy migration имеют состояния, ошибки и security invariants.
- [x] Release pipeline перечисляет source, images, packages, checksums, SBOM, provenance и clean-room gates.
- [x] `SPEC-MAP.md`, `common/main.md` и `common/structure.md` согласованы с новым spec-space.
- [x] Реализация разложена на независимые последовательные WI без преждевременного создания WAL.
- [x] Spec lint, typecheck, lint и tests проходят.

## Result

Приняты active `PROP-007`, `FEAT-007`, `PROP-102` и `INFRA-004`. Они фиксируют
self-hosted trust domain, operator-controlled enrollment/revoke, legacy token
migration, public artifacts, CI/security gates и clean-room publication.

`SPEC-MAP`, `common/main`, `common/structure` и `ROADMAP` синхронизированы.
Реализация разложена на зависимые `WI-004`–`WI-010`. Проверки 2026-08-23:
spec lint `22/22` unique specs и `10` unique WI, typecheck/lint passed, tests
`45/45`, diff check passed.
