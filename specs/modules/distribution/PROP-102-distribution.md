---
status: active
---

# PROP-102: Канон публичной дистрибуции {#root}

## Простыми словами {#plain-language}

Модуль distribution превращает принятый source revision в проверяемые
container images, worker packages, checksums, provenance и документацию,
которыми может воспользоваться незнакомый с проектом человек.

## 1. Назначение {#goal}

Зафиксировать ownership публичной supply chain Agent Operator и границу между
product source, release automation и platform-specific installation.

## 2. Границы {#scope}

### 2.1. Входит {#scope.in}

- GitHub Actions CI/release workflows;
- versioned GHCR coordinator images;
- macOS/Windows worker packages;
- checksums, SBOM, provenance и release notes;
- generic Docker Compose/Caddy templates;
- release-critical public documentation;
- clean-room artifact acceptance.

### 2.2. За границей {#scope.out}

- coordinator domain behavior и mailbox implementation;
- worker execution semantics и Desktop IPC;
- hosted service operations;
- package stores и native signing/notarization;
- personal production deployment history.

## 3. Инварианты {#rules}

- Публичный artifact создаётся только из immutable Git tag.
- Один release version связывает source, coordinator и worker packages.
- CI rebuild не использует developer-local files и credentials.
- Artifact digest сохраняется в release metadata и verification receipt.
- Secrets недоступны pull-request builds из недоверенного fork.
- Release job запускается после полного CI и security gates.
- Исторический release immutable; исправление получает новую версию.
- Personal endpoint, agent IDs, paths и infrastructure aliases отсутствуют в
  generic templates и installers.
- Clean-room acceptance использует только опубликованные artifacts.

## 4. Owned paths {#ownership}

Целевой ownership:

- `.github/workflows/**` — CI, security и release automation;
- `deploy/self-hosted/**` — generic coordinator templates;
- `scripts/release/**` — deterministic package/manifest helpers;
- `scripts/install/**` — public installer lifecycle;
- `docs/getting-started/**`, `docs/security/**` — public release-critical docs;
- generated release metadata — GitHub Release/GHCR, source of truth is tag.

Существующие `deploy/**`, `scripts/windows/**` и operational docs переходят к
этой карте постепенно через отдельные WI; текущий production profile остаётся
под coordinator/worker specs до migration.

## 5. Подчинённый канон {#specs}

- `spec://modules/distribution/INFRA-004-open-source-release#root` — pipeline,
  artifacts, security gates и публикация.
- `spec://modules/worker/INFRA-003-release-and-recovery#root` — установленный
  worker, update и rollback на host.
- `spec://modules/coordinator/INFRA-001-coordinator-runtime#root` — coordinator
  runtime, persistence, backup и restore.

## 6. Трассировка {#traceability}

Новые workflow jobs, packaging helpers, installer entrypoints и generic deploy
templates получают `@spec` на owning anchor INFRA-004. Platform runtime code
сохраняет ссылки на coordinator/worker owning specs.

## 7. Чеклист заполнения {#checklist}

- [x] Release automation и product runtime разделены ownership.
- [x] Immutable tag и artifact provenance обязательны.
- [x] Generic/public и personal/internal deployment разделены.
- [x] Clean-room acceptance принадлежит distribution.
- [x] Native stores/signing остаются будущим каноном.

## 8. Связи {#relationships}

- `spec://common/PROP-007-OPEN-SOURCE#deliverables`
- `spec://common/PROP-002-STACK#deploy`
- `spec://modules/coordinator/PROP-100-coordinator#root`
- `spec://modules/worker/PROP-101-worker#root`

## 9. История изменений {#changelog}

- [2026-08-23] Создан модуль публичной дистрибуции `v0.2.0-alpha`.
