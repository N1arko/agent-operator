---
status: active
---

# PROP-007: Open-source продукт {#root}

## Простыми словами {#plain-language}

Agent Operator распространяется как бесплатный self-hosted продукт. Владелец
разворачивает один coordinator, подключает собственные компьютеры и получает
единый доверенный контур для своих Codex-агентов.

## 1. Назначение {#goal}

Зафиксировать продуктовую границу публичного релиза `v0.2.0-alpha`, его
аудиторию, модель доверия, состав поставки и наблюдаемый критерий
самостоятельности.

## 2. Границы {#scope}

### 2.1. Входит {#scope.in}

- публичный source repository под Apache-2.0;
- self-hosted coordinator для одного trust domain;
- worker на поддерживаемых macOS и Windows host;
- самостоятельный enrollment и revoke устройств;
- конфигурация локальных проектов и Codex integration;
- install, diagnose, update, rollback, backup, restore и uninstall;
- русская и английская документация;
- GitHub Releases и GHCR artifacts с проверяемым происхождением.

### 2.2. За границей {#scope.out}

- общий hosted coordinator с публичной регистрацией;
- несколько независимых организаций в одном deployment;
- сложные роли и ACL внутри trust domain;
- web-панель, расписания и автоматическая оркестрация;
- несколько одновременных turn одного worker;
- App Store, Microsoft Store, notarized PKG и MSI;
- гарантии стабильной поддержки внутреннего Codex Desktop IPC.

## 3. Аудитория и результат {#audience}

Первичная аудитория — технический пользователь, который:

- имеет VPS, домашний server или другую Docker-capable машину;
- использует Codex Desktop на двух или более собственных host;
- готов управлять доменом/TLS либо частной сетью;
- принимает alpha compatibility window и читает release notes перед update.

После Quick Start пользователь без помощи автора должен:

1. запустить coordinator;
2. создать одноразовый enrollment code;
3. подключить Mac и Windows;
4. выбрать локальные проекты;
5. отправить задачу между двумя Codex и получить результат;
6. диагностировать состояние, обновить и удалить установку.

## 4. Модель доверия {#trust-domain}

- Один deployment образует один trust domain.
- Владелец coordinator отвечает за membership устройств и инфраструктуру.
- Все зарегистрированные устройства доверяют друг другу видеть safe presence и
  опубликованные project descriptors и отправлять работу в пределах канона.
- Локальные пути, source tree, полный список chats и OpenAI credentials остаются
  на host worker.
- Coordinator хранит mailbox/presence metadata, delivery state и ограниченные
  временные файлы по существующим TTL/quota.
- Публичный internet endpoint получает TLS, authentication, request limits и
  operator-controlled enrollment.
- Shared hosted deployment для несвязанных пользователей требует отдельного
  канона tenant isolation до реализации.

## 5. Состав поставки {#deliverables}

Публичный release содержит:

- source tag и release notes;
- versioned coordinator container images;
- macOS и Windows worker packages;
- installer lifecycle scripts;
- `coordinate-agents` skill;
- `SHA256SUMS`, SBOM и build provenance;
- Docker Compose/Caddy templates;
- Quick Start, operations, security, troubleshooting и contribution docs.

Точные artifact contracts принадлежат
`spec://modules/distribution/INFRA-004-open-source-release#artifacts`.

## 6. Версии и совместимость {#compatibility}

- Публичная линия начинается с `v0.2.0-alpha`.
- Coordinator и worker используют один release version; coordinator принимает
  только явно совместимые worker versions.
- Release notes публикуют проверенную матрицу OS, architecture, Node и Codex
  Desktop/app-server.
- Alpha может ограничить поддержку теми platform/version combinations, которые
  прошли clean-room E2E exact artifacts.
- Несовместимая версия получает явную diagnose/error причину.
- Изменение внутреннего Desktop IPC требует focused regression и живой E2E на
  каждой заявленной платформе.

## 7. Документация и язык {#documentation}

- Русские документы сохраняют полный пользовательский и эксплуатационный путь.
- Английская версия покрывает тот же release-critical scope.
- Команды, имена файлов и technical identifiers одинаковы в обеих версиях.
- Historical personal deployment evidence отделяется от публичной инструкции.
- Quick Start использует только placeholders и публичные artifacts.

## 8. Лицензирование и участие {#community}

- Source release использует Apache License 2.0.
- Repository содержит `LICENSE`, `NOTICE` при необходимости, `SECURITY.md`,
  `CONTRIBUTING.md`, Code of Conduct и issue/PR templates.
- Dependency license inventory является release evidence.
- Security report имеет приватный канал GitHub Security Advisories либо другой
  явно опубликованный контакт.

## 9. Критерии готовности {#acceptance}

- Новый пользователь завершает основной сценарий из публичной документации.
- Clean checkout проходит CI и воспроизводит release artifacts.
- Production dependency audit не содержит high/critical advisories.
- История repository проходит secret/private-data scan.
- Source tag, image digests, packages, checksums, SBOM и provenance связаны.
- Fresh macOS/Windows/VPS acceptance проходит enrollment, task, follow-up,
  cancel, files, restart, backup/restore, update/rollback/revoke/uninstall.
- Известные alpha limitations перечислены рядом с Quick Start и release notes.
- Public repository и release доступны без приватных credentials.

## 10. Соседний канон {#relationships}

- `spec://common/main#scope`
- `spec://common/PROP-004-PRODUCT#scenarios`
- `spec://common/PROP-006-API#auth`
- `spec://modules/coordinator/FEAT-007-device-enrollment#root`
- `spec://modules/distribution/PROP-102-distribution#root`
- `spec://modules/distribution/INFRA-004-open-source-release#root`

## 11. Чеклист заполнения {#checklist}

- [x] Self-hosted audience и trust-domain описаны.
- [x] Состав `v0.2.0-alpha` и out-of-scope зафиксированы.
- [x] Public artifacts и release gates перечислены.
- [x] Enrollment и distribution вынесены в owning specs.
- [x] Hosted multi-tenant требует отдельного будущего канона.

## 12. История изменений {#changelog}

- [2026-08-23] Принят канон бесплатного self-hosted open-source релиза
  `v0.2.0-alpha`.
