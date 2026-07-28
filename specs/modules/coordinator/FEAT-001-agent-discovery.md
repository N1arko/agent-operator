# FEAT-001: Обнаружение агентов {#root}

## Простыми словами {#plain-language}

Codex может увидеть подключённые компьютеры, их доступность, безопасное
описание текущей работы и опубликованные локальные проекты.

## 1. Цель {#goal}

Дать caller достаточно информации для выбора recipient без публикации локальной
истории и путей.

## 2. Управляющие спеки {#governing-specs}

- `spec://modules/coordinator/PROP-100-coordinator#rules`
- `spec://common/PROP-001-DATA#sources`
- `spec://common/PROP-004-PRODUCT#roles.caller`
- `spec://common/PROP-006-API#mcp`

## 3. Границы {#scope}

Входят `agents_list`, `agent_status`, `agent_projects`, heartbeat-derived
state и безопасная current activity. Поиск задач относится к FEAT-003.

## 4. Участники и trigger {#actors}

Caller запрашивает доступных исполнителей перед удалённой работой. Worker
периодически публикует имя, platform, state, activity, current project и
project descriptors.

## 5. Сценарии {#scenarios}

1. `agents_list` возвращает зарегистрированных агентов с актуальным state.
2. `agent_status` возвращает один agent и последнюю безопасную activity.
3. `agent_projects` возвращает стабильные ID, названия, tags и availability.
4. Устаревший heartbeat делает agent `offline`.
5. Перемещённый или отсутствующий локальный каталог публикуется unavailable
   после диагностики worker.

Ни один из этих ответов не содержит полный список задач и абсолютный путь.

## 6. Данные {#data}

Используются Agent и ProjectDescriptor из
`spec://common/PROP-001-DATA#entities`. Worker является владельцем project
mapping, coordinator хранит последний опубликованный snapshot.

## 7. Контракты {#contracts}

- `agents_list()` — все зарегистрированные AgentDescriptor.
- `agent_status(agentId)` — один descriptor или unknown agent.
- `agent_projects(agentId)` — массив ProjectDescriptor.
- worker heartbeat — полная публикация текущего snapshot.

## 8. Ошибки {#errors}

Неизвестный agent возвращает явную ошибку. Offline agent остаётся видимым.
Недоступный project не может быть выбран в `agent_start`.

## 9. Трассировка реализации {#traceability}

- `src/coordinator/mcp.ts`
- `src/coordinator/store.ts`
- `src/worker/worker.ts` heartbeat
- `test/mcp.test.ts`, `test/store.test.ts`, `test/vertical.test.ts`

## 10. Критерии готовности {#acceptance}

- Состояния `idle`, `busy`, `offline`, `error` проверены.
- Project descriptors обновляются heartbeat.
- Ответы не содержат абсолютных путей и историю задач.
- Mac и Windows видны друг другу через production coordinator.

## 11. Связи {#relations}

FEAT-002 использует выбранный agent; FEAT-003 использует выбранный project.

## 12. История изменений {#changelog}

- [2026-07-28] Зафиксировано реализованное discovery-поведение 0.1.18.
