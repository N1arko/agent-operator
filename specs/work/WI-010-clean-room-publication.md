# WI-010: Пройти clean-room acceptance и опубликовать v0.2

- Kind: `migration`
- Canon action: `none`

## Outcome

Public GitHub repository и `v0.2.0-alpha` release доступны анонимному пользователю и подтверждены clean-room двусторонним E2E exact published artifacts.

## Specs

- Governing: `spec://common/PROP-007-OPEN-SOURCE#acceptance`
- Governing: `spec://modules/distribution/INFRA-004-open-source-release#release`
- Constraint: `spec://modules/distribution/INFRA-004-open-source-release#security`

## Scope

- In: final history/security audit, fresh VPS/macOS/Windows acceptance, enrollment/revoke, task/follow-up/cancel/files/restart/backup/restore/update/rollback/uninstall, visibility switch, release publication, anonymous verification.
- Out: hosted multi-tenant, web UI, stores и launch marketing campaign.

## Dependencies

- Depends on: `WI-009`

## Acceptance

- [ ] Все Goal release gates относятся к final tag/digests.
- [ ] Fresh clean-room сценарий пройден на заявленной support matrix.
- [ ] Repository public, anonymous clone работает.
- [ ] GHCR pull и release downloads доступны и проходят checksum.
- [ ] Quick Start выполняется анонимным пользователем.
- [ ] Known limitations и evidence опубликованы рядом с release.

## Result

Заполняется при завершении.
