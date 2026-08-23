# ADR-0002: запуск npm Codex на Windows через Node.js

- Статус: принято
- Дата: 2026-07-26

## Контекст

Windows-worker `0.1.0` был установлен с нативным `codex.exe` версии `0.114.0`.
Heartbeat, публикация проектов и получение сообщения работали. Первый
удалённый `agent_start` завершился до создания thread:

```text
error deriving config: C:\Users\example-user\.codex\config.toml:
unknown variant `default`, expected `fast` or `flex`
```

Пользовательский `config.toml` создан более новой поверхностью Codex. Изменение
его `service_tier` повлияло бы на остальные локальные запуски и режим скорости.
Windows npm-команда `codex` использует `.cmd`-обёртку, которую worker не может
надёжно запускать как обычный executable через `child_process.spawn`.

## Решение

Worker `0.1.1` поддерживает:

- `AOP_CODEX_BIN` — исполняемый файл;
- `AOP_CODEX_ARGS_JSON` — JSON-массив аргументов перед командой `app-server`.

Windows installer с `-UseNpmCodex` устанавливает закреплённый
`@openai/codex@0.145.0` локально и запускает его так:

```text
node.exe <install-dir>\node_modules\@openai\codex\bin\codex.js app-server
```

Тот же launcher используется диагностикой для `--version`. Пользовательский
`config.toml` сохраняется без изменений.

## Дополнительные изменения

- диагностика выставляет `process.exitCode` и позволяет сетевым handles
  закрыться штатно;
- `@hono/node-server` закреплён на `2.0.10`;
- production audit после обновления не содержит известных уязвимостей.

## Последствия

Windows bundle содержит локальную копию npm Codex и занимает больше места.
Версия launcher закреплена и обновляется вместе с worker после отдельной
проверки совместимости.
