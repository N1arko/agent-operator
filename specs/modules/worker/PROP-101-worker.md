# PROP-101: Канон worker {#root}

## Простыми словами {#plain-language}

Worker постоянно доступен на локальном компьютере, знает его проекты и задачи,
запускает Codex, показывает работу в Desktop и возвращает результат.

## 1. Назначение {#goal}

Зафиксировать локальное владение данными, последовательное исполнение,
интеграцию с Codex и границы macOS/Windows runtime.

## 2. Границы {#scope}

### Входит {#scope.in}

- identity, projects и local state;
- long polling и heartbeat;
- очередь, bindings и один активный turn;
- app-server, Codex state DB и Desktop follower IPC;
- model discovery и validation;
- локальное разрешение attachments;
- автозапуск, диагностика и recovery.

### За границей {#scope.out}

- durable global mailbox;
- хранение project paths на VPS;
- несколько одновременных turn одного worker;
- управление пользовательским Desktop через клики;
- изменение чужого проекта без task request.

## 3. Инварианты {#rules}

- Worker публикует дескрипторы, локальные пути остаются на host.
- Pending message сохраняется до исполнения.
- Один worker выполняет один turn.
- Binding сохраняет root request, thread и project.
- Desktop-owned команда и headless fallback взаимоисключаются после принятия.
- Final result берётся из сохранённого успешного turn.
- App-server запускается лениво; worker остаётся постоянно доступным.

## 4. Owned code {#traceability}

- `src/worker/**`
- `scripts/configure-macos.mjs`, `scripts/install-macos-launch-agent.mjs`
- `scripts/windows/**`, `scripts/package-windows.sh`
- worker-related tests and update docs

## 5. Управляющие спеки {#governing-specs}

- `spec://common/PROP-001-DATA#sources`
- `spec://common/PROP-005-RUNTIME#recovery`
- `spec://common/PROP-003-UI#surfaces`

## 6. История изменений {#changelog}

- [2026-07-28] Канон worker выделен из существующей архитектуры.
