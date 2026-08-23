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

- [x] Fresh supported macOS и Windows profiles устанавливаются из packages.
- [x] Первый heartbeat и control task проходят после install.
- [x] Update сохраняет config/state, rollback восстанавливает предыдущую версию.
- [x] Uninstall удаляет выбранный scope и не повреждает Codex/user projects.
- [x] Packages не содержат personal config, coordinator source и tests.

## Result

Cross-platform lifecycle реализован в commits `5ab62de`, `1a1f831`,
`4b5cd12`, `9baec55` и `8e4aa2c`. Linux job один раз собирает versioned macOS
и Windows artifacts; точные artifacts затем проходят install, enrollment,
service, MCP/skill integration, heartbeat, deterministic control task, update,
rollback и uninstall на clean GitHub-hosted macOS 26 ARM64 и Windows Server
2025 profiles. Durable state сохранён, пользовательский project остался без
изменений, runtime/config/integration удалены в заявленном scope. CI quality,
production audit и full-history Gitleaks завершились успешно. Полная запись
приёмки: `docs/evidence/worker-lifecycle-WI-007.json`.
