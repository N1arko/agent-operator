# SPEC MAP

`SPEC-MAP.md` — человекочитаемый каталог канона Agent Operator. Точный scope и anchors живут в самих спеках; lifecycle новых и существенно изменённых документов задаётся полем `status`. Legacy-документы без поля считаются `active`.

## Active canon

### Common

| Spec | Ответственность | Lifecycle |
|---|---|---|
| [PROP-000](common/PROP-000-workflow.md) | Spec-driven workflow, качество и трассировка | active |
| [PROP-001](common/PROP-001-DATA.md) | Данные, источники истины и хранение | active |
| [PROP-002](common/PROP-002-STACK.md) | Стек, сервисы и окружения | active |
| [PROP-003](common/PROP-003-UI.md) | Пользовательские поверхности и язык интерфейса | active |
| [PROP-004](common/PROP-004-PRODUCT.md) | Роли и продуктовые сценарии | active |
| [PROP-005](common/PROP-005-RUNTIME.md) | Runtime, очередь и восстановление | active |
| [PROP-006](common/PROP-006-API.md) | API-контракты, доступ и ошибки | active |
| [PROP-007](common/PROP-007-OPEN-SOURCE.md) | Self-hosted open-source продукт и trust domain | active |

### Coordinator

| Spec | Ответственность | Lifecycle |
|---|---|---|
| [PROP-100](modules/coordinator/PROP-100-coordinator.md) | Границы и ownership coordinator | active |
| [FEAT-001](modules/coordinator/FEAT-001-agent-discovery.md) | Обнаружение агентов и presence | active |
| [FEAT-002](modules/coordinator/FEAT-002-task-coordination.md) | Запуск, продолжение, очередь и отмена задач | active |
| [FEAT-004](modules/coordinator/FEAT-004-artifact-transfer.md) | Git-файлы и временные вложения | active |
| [FEAT-006](modules/coordinator/FEAT-006-progress-updates.md) | Промежуточные обновления удалённой задачи | active |
| [FEAT-007](modules/coordinator/FEAT-007-device-enrollment.md) | Enrollment, credentials и revoke устройств | active |
| [INFRA-001](modules/coordinator/INFRA-001-coordinator-runtime.md) | Production runtime coordinator | active |

### Worker

| Spec | Ответственность | Lifecycle |
|---|---|---|
| [PROP-101](modules/worker/PROP-101-worker.md) | Границы и ownership worker | active |
| [FEAT-003](modules/worker/FEAT-003-local-targeting.md) | Выбор локального проекта и задачи | active |
| [FEAT-005](modules/worker/FEAT-005-desktop-visible-delivery.md) | Видимое выполнение в Codex Desktop | active |
| [INFRA-002](modules/worker/INFRA-002-worker-runtime.md) | Локальный runtime macOS и Windows | active |
| [INFRA-003](modules/worker/INFRA-003-release-and-recovery.md) | Доставка, обновление и восстановление worker | active |

### Distribution

| Spec | Ответственность | Lifecycle |
|---|---|---|
| [PROP-102](modules/distribution/PROP-102-distribution.md) | Ownership публичной дистрибуции | active |
| [INFRA-004](modules/distribution/INFRA-004-open-source-release.md) | CI, artifacts, supply chain и clean-room release | active |

## Draft

Активных draft-спек нет.

## Superseded and retired

Зарегистрированных superseded или retired спек нет.

## Waves

1. Обновить workflow и зафиксировать воспроизводимый baseline `0.1.23`.
2. Принять open-source канон self-hosted `v0.2.0-alpha` и security model.
3. Универсализировать coordinator, enrollment и lifecycle устройств.
4. Выпустить переносимые worker packages, CI, GHCR и GitHub Releases.
5. Пройти clean-room acceptance и открыть репозиторий.

Статус конкретной работы хранится в [`BOARD.md`](BOARD.md), outcome и acceptance — в `specs/work/WI-NNN-*.md`.

## Dependencies

- Публичная упаковка опирается на принятый exact baseline `0.1.23`.
- Публикация следует после security/history audit и clean-room acceptance exact release artifacts.
- Hosted multi-tenant контур находится за границами `v0.2.0-alpha`.
