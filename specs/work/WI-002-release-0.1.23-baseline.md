# WI-002: Зафиксировать воспроизводимый baseline 0.1.23

- Kind: `migration`
- Canon action: `none`

## Outcome

Все уже выполненные изменения релиза `0.1.23` независимо приняты, связаны с одним Git SHA и воспроизводимыми coordinator/worker artifacts, чтобы open-source работа начиналась с чистого подтверждённого baseline.

## Specs

- Governing: `spec://modules/coordinator/FEAT-002-task-coordination#scenarios.cancel`
- Governing: `spec://modules/worker/FEAT-005-desktop-visible-delivery#scenarios.terminal`
- Governing: `spec://modules/worker/INFRA-002-worker-runtime#rollout`
- Constraint: `spec://modules/worker/INFRA-003-release-and-recovery#acceptance`

## Scope

- In: аудит всего оставшегося diff `0.1.23`, семантическая приёмка cancellation/observation boundary, version/document/package consistency, воспроизводимая сборка Windows bundle, сопоставление с текущим deployment, commit и baseline tag.
- Out: open-source product contract, изменение enrollment, универсализация deployment, исправление dependency advisories следующей волны.
- Preserve: production state и данные, существующие worker installations, пользовательские изменения, соседние проекты.

## Acceptance

- [ ] Каждый оставшийся изменённый файл относится к `0.1.23` и согласован с governing specs.
- [ ] Regression tests покрывают timeout interrupt, поздний progress, очередь и observation leases.
- [ ] Version `0.1.23` согласована в package, health, deployment, operations и worker package.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` и `git diff --check` проходят на final revision.
- [ ] Windows worker bundle собирается из final revision, его SHA-256 сохранён в release evidence.
- [ ] Текущий production health и worker state сопоставлены с `0.1.23` без изменения production.
- [ ] Baseline commit и tag однозначно связывают source, evidence и artifacts; working tree после фиксации чистый.

## Result

Заполняется после независимой приёмки baseline.
