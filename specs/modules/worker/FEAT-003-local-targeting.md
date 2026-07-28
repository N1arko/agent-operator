# FEAT-003: Выбор локального проекта и задачи {#root}

## Простыми словами {#plain-language}

Удалённый агент выбирает опубликованный проект для новой работы либо находит
недавнюю задачу и продолжает её по точному thread ID.

## 1. Цель {#goal}

Направлять запрос в правильный локальный контекст, устойчивый к разным путям
на Mac и Windows.

## 2. Управляющие спеки {#governing-specs}

- `spec://modules/worker/PROP-101-worker#rules`
- `spec://common/PROP-001-DATA#sources`
- `spec://common/PROP-004-PRODUCT#rules`
- `spec://common/PROP-006-API#mcp`

## 3. Границы {#scope}

Входят project registry, publication, bounded thread search, exact thread
read и model discovery. Автоматический полнотекстовый обход rollout и
публикация всех чатов за границей.

## 4. Сценарии {#scenarios}

### Новая задача в project {#scenarios.project}

1. Worker находит `projectId` в локальном registry.
2. Проверяет наличие primary path.
3. Использует path как `cwd`; дополнительные roots задаются конфигурацией.
4. Создаёт именованную задачу и сохраняет binding.

### Поиск задачи {#scenarios.search}

1. `agent_threads` передаёт query и limit 1–20 через mailbox.
2. Worker вызывает `thread/list` с `useStateDbOnly: true`.
3. Возвращает ID, title, timestamps и сопоставленный project descriptor.
4. Абсолютный `cwd` удаляется из результата.

### Точное продолжение {#scenarios.thread}

Worker проверяет UUID через `thread/read`, сохраняет исходный cwd задачи и
запускает новый turn. Published project для этого не обязателен.

### Модели {#scenarios.models}

`agent_models` вызывает локальный `model/list` и возвращает доступные model ID,
default и supported reasoning efforts. Выбранные overrides проверяются перед
turn.

## 5. Данные {#data}

Локальный `projects.json` хранит ID, name, path и tags. Путь может измениться
только локально; стабильность внешней ссылки обеспечивает ID. Thread ID
принадлежит Codex. Binding связывает root request с thread/project.

## 6. Контракты {#contracts}

- publication ProjectDescriptor без path;
- `agent_threads(agentId, query?, limit?)`;
- `agent_thread_send(agentId, threadId, ...)`;
- `agent_models(agentId)`;
- worker-local project and state file schemas.

## 7. Ошибки {#errors}

Unknown/unavailable project, отсутствующий path, неверный thread ID, active
thread и неподдерживаемая model/reasoning дают конкретный failed result.
Поиск ограничен state DB и 20 результатами.

## 8. Трассировка реализации {#traceability}

- `src/shared/protocol.ts`
- `src/worker/main.ts`, `src/worker/state.ts`, `src/worker/app-server.ts`
- `src/worker/worker.ts`
- `test/app-server.test.ts`, `test/state.test.ts`, `test/vertical.test.ts`

## 9. Критерии готовности {#acceptance}

- Один и тот же project ID разрешается в локальный путь каждого host.
- Coordinator не получает путь.
- Поиск ограничен 20 и не сканирует rollout files.
- Projectless thread продолжается по точному ID.
- Model/reasoning discovery отражает recipient.

## 10. Связи {#relations}

FEAT-002 создаёт mailbox request; FEAT-005 выполняет выбранный turn.

## 11. История изменений {#changelog}

- [2026-07-28] Сведены AOP-017, 033–037, 103 и 077.
