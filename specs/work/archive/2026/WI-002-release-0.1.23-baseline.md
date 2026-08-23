# WI-002: Зафиксировать воспроизводимый baseline 0.1.23

- Kind: `migration`
- Canon action: `none`

## Outcome

Все уже выполненные изменения релиза `0.1.23` независимо приняты, связаны с
одним Git SHA и воспроизводимыми coordinator/worker artifacts, чтобы
open-source работа начиналась с чистого подтверждённого baseline.

## Specs

- Governing: `spec://modules/coordinator/FEAT-002-task-coordination#scenarios.cancel`
- Governing: `spec://modules/worker/FEAT-005-desktop-visible-delivery#scenarios.terminal`
- Governing: `spec://modules/worker/INFRA-002-worker-runtime#rollout`
- Constraint: `spec://modules/worker/INFRA-003-release-and-recovery#acceptance`

## Scope

- In: аудит diff `0.1.23`, семантическая приёмка cancellation/observation
  boundary, version/document/package consistency, воспроизводимая сборка
  Windows bundle, сопоставление с deployment, commit и baseline tag.
- Out: open-source product contract, enrollment, универсализация deployment,
  исправление dependency advisories следующей волны.
- Preserve: production state и данные, worker installations, пользовательские
  изменения, соседние проекты.

## Acceptance

- [x] Каждый оставшийся изменённый файл относится к `0.1.23` и согласован с governing specs.
- [x] Regression tests покрывают timeout interrupt, поздний progress, очередь и observation leases.
- [x] Version `0.1.23` согласована в package, health, deployment, operations и worker package.
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm test` и `git diff --check` проходят на final revision.
- [x] Windows worker bundle собирается из final revision, его SHA-256 сохранён в release evidence.
- [x] Текущий production health и worker state сопоставлены с `0.1.23` без изменения production.
- [x] Baseline commit и tag однозначно связывают source, evidence и artifacts; working tree после фиксации чистый.

## Result

Принят source baseline commit
`487ced89491763c034cb027057fcce3e0252250e`. Production read-only сверка
подтвердила health `0.1.23`, heartbeat обоих worker и побайтное совпадение шести
изменённых compiled-файлов с локальной сборкой. Исторический bundle сохранил
документированный SHA-256; временная повторная сборка и пофайловый manifest
зафиксированы в `docs/evidence/0.1.23-baseline.json`.

Проверки 2026-08-23: typecheck и lint passed, spec lint зарегистрировал 18
спек и два WI, полный suite `45/45`, focused suite трижды `36/36`, diff check
passed. Свежие dependency advisories зарегистрированы в `TD-003` и оставлены
gate следующей open-source работы. Annotated tag `v0.1.23` указывает на
принятую архивную ревизию WI.
