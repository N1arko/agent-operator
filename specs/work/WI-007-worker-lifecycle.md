# WI-007: Реализовать lifecycle worker packages

- Kind: `implement`
- Canon action: `none`

## Outcome

Публичные macOS и Windows packages выполняют install, enrollment, project setup, doctor, update, rollback и uninstall из одного release contract.

## Specs

- Governing: `spec://modules/distribution/INFRA-004-open-source-release#worker-lifecycle`
- Governing: `spec://modules/worker/INFRA-003-release-and-recovery#root`
- Governing: `spec://modules/coordinator/FEAT-007-device-enrollment#scenarios.enroll`

## Scope

- In: platform packages/scripts, credential storage, project config, service/MCP/skill install, diagnose, state-preserving update/rollback, scoped uninstall, package smoke tests.
- Out: native stores, notarized PKG/MSI и background auto-update.

## Dependencies

- Depends on: `WI-006`

## Acceptance

- [ ] Fresh supported macOS и Windows profiles устанавливаются из packages.
- [ ] Первый heartbeat и control task проходят после install.
- [ ] Update сохраняет config/state, rollback восстанавливает предыдущую версию.
- [ ] Uninstall удаляет выбранный scope и не повреждает Codex/user projects.
- [ ] Packages не содержат personal config, coordinator source и tests.

## Result

Заполняется при завершении.
