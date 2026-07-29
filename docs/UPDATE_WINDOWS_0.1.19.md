# Обновление Windows-worker до 0.1.19

## Цель

Обновить coordinator и worker до версии с последовательными follow-up,
промежуточными обновлениями и профилями выбора модели.

## Проверки

- package SHA-256 совпадает с опубликованным значением;
- `diagnose.ps1` завершается успешно;
- Scheduled Task запускает каталог `0.1.19`;
- heartbeat показывает worker `0.1.19`;
- два follow-up к одной задаче выполняются последовательно;
- повтор с одним idempotency key создаёт один turn;
- длительная задача отдаёт `update` с `isFinal: false`, затем один `result` с
  `isFinal: true`;
- fast, balanced и deep разрешаются через актуальный каталог моделей;
- worker возвращается в `idle`, очередь пуста;
- `npm audit --omit=dev` завершается успешно.

## Порядок

1. Сохранить PID текущей пары host/worker и проверить их CommandLine.
2. Скачать onboarding package coordinator и проверить опубликованный SHA-256.
3. Распаковать package в
   `C:\Users\nikit\AppData\Local\AgentOperator\0.1.19`.
4. Запустить `install-worker.ps1` с действующей конфигурацией и
   `-UseNpmCodex`.
5. Запустить `install-codex-integration.ps1`.
6. Выполнить `diagnose.ps1` и `npm audit --omit=dev`.
7. Обновить action Scheduled Task `Agent Operator Worker` на
   `0.1.19\run-worker.ps1`, сохранив trigger, principal и settings.
8. Перезапустить Scheduled Task и проверить два последовательных heartbeat.
9. Выполнить двусторонние E2E из критериев выше.

Каталог `0.1.18` сохраняется для отката.
