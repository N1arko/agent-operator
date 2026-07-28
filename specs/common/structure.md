# Структура спецификаций и ownership {#root}

## Простыми словами {#plain-language}

Проект состоит из coordinator на VPS и локального worker на каждом компьютере.
Общие схемы связывают модули. Эксплуатационные документы и ADR поддерживают
спеки доказательствами и историей решений.

## Индекс модулей {#modules.index}

| Модуль | Канон | Ответственность |
| --- | --- | --- |
| `coordinator` | `spec://modules/coordinator/PROP-100-coordinator#root` | presence, mailbox, MCP/HTTP, очередь и временные файлы |
| `worker` | `spec://modules/worker/PROP-101-worker#root` | локальные проекты и задачи, Codex runtime, Desktop delivery и восстановление |

## Карта кода {#code-map}

| Путь | Владелец | Namespace |
| --- | --- | --- |
| `src/coordinator/**` | coordinator | `spec://modules/coordinator/*` |
| `src/worker/**` | worker | `spec://modules/worker/*` |
| `src/shared/**` | common | `spec://common/*` |
| `deploy/**` | coordinator | `spec://modules/coordinator/*` |
| `scripts/**` | worker | `spec://modules/worker/*` |
| `integrations/**` | coordinator + worker | `spec://modules/coordinator/*` |
| `test/**` | соответствующая реализация | управляющая FEAT/INFRA |

## Поддерживающие документы {#supporting-docs}

- `docs/adr/` объясняет выбор решений.
- `docs/OPERATIONS.md` задаёт операторские процедуры.
- `docs/E2E_*.md` фиксирует живые проверки релизов.
- `docs/UPDATE_WINDOWS_*.md` хранит историю доставок Windows worker.
- `KANBAN.md` хранит историю карточек AOP до перехода на текущую доску.

## История изменений {#changelog}

- [2026-07-28] Зарегистрированы модули coordinator и worker.
