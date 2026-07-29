# Обновление Windows-worker до 0.1.20

## Цель

Обновить worker 0.1.19 до версии, которая читает промежуточные items активного
Desktop turn через read-only app-server snapshot и публикует их до final.

## Проверки

- package SHA-256 совпадает с опубликованным значением;
- `diagnose.ps1` завершается успешно;
- Scheduled Task запускает каталог `0.1.20`;
- heartbeat показывает worker `0.1.20`;
- длительная Desktop-задача отдаёт минимум один `update` с
  `isFinal: false`, затем один `result` с `isFinal: true`;
- update имеет меньший cursor, чем result;
- reasoning и command output отсутствуют в coordinator;
- worker возвращается в `idle`, очередь пуста;
- `npm audit --omit=dev` завершается успешно.

## Порядок

1. Скачать onboarding package coordinator и проверить SHA-256.
2. Распаковать package в
   `C:\Users\nikit\AppData\Local\AgentOperator\0.1.20`.
3. Запустить `install-worker.ps1` с действующей конфигурацией и
   `-UseNpmCodex`.
4. Запустить `install-codex-integration.ps1`.
5. Выполнить `diagnose.ps1` и `npm audit --omit=dev`.
6. Обновить action Scheduled Task `Agent Operator Worker` на
   `0.1.20\run-worker.ps1`, сохранив trigger, principal и settings.
7. Переключить worker через отдельную отложенную Scheduled Task после
   завершения текущего turn.
8. Проверить два heartbeat и живой progress E2E.

Каталоги `0.1.18` и `0.1.19` сохраняются для отката.
