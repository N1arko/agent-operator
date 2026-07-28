# Обновление Windows-worker до 0.1.16

## Цель

Обновить worker и подключить Agent Operator MCP вместе с routing skill к
обычным чатам Codex на Windows.

## Проверки

- package SHA-256:
  `d4f7220b82a770f92a94281688357f6ea54f36428d25a422e251202128b5a75d`;
- `diagnose.ps1` завершается успешно;
- Scheduled Task запускает каталог `0.1.16`;
- heartbeat показывает worker `0.1.16`;
- `install-codex-integration.ps1` добавляет MCP `agent-operator` и skill
  `coordinate-agents`;
- подключение MCP сохраняется в пользовательском `~/.codex/.env`, поэтому
  новый процесс app-server подхватывает его при запуске Desktop;
- новый обычный чат Codex видит Agent Operator tools;
- тест Windows → Mac создаёт один видимый Desktop-turn и получает один result.

## Порядок

1. Сохранить PID текущей пары host/worker и проверить их CommandLine.
2. Скачать onboarding package coordinator и проверить опубликованный SHA-256.
3. Распаковать package в
   `C:\Users\nikit\AppData\Local\AgentOperator\0.1.16`.
4. Запустить `install-worker.ps1` с действующей конфигурацией и
   `-UseNpmCodex`.
5. Запустить `install-codex-integration.ps1`.
6. Выполнить `diagnose.ps1` и `npm audit --omit=dev`.
7. Обновить только action Scheduled Task `Agent Operator Worker` на
   `0.1.16\run-worker.ps1`, сохранив trigger, principal и settings.
8. Перезапустить Scheduled Task и проверить два последовательных heartbeat.
9. Полностью завершить ChatGPT/Codex Desktop и открыть приложение снова.
10. Открыть новый обычный чат и выполнить двустороннюю проверку.

Каталог `0.1.15` сохраняется для отката.
