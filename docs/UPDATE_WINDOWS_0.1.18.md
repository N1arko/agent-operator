# Обновление Windows-worker до 0.1.18

## Цель

Обновить worker и проверить полный Desktop follower handshake для первого
удалённого turn. Worker регистрирует follower, ждёт snapshot owner, выполняет
turn и после завершения загружает полную историю в renderer.

## Проверки

- package SHA-256 совпадает с опубликованным значением;
- `diagnose.ps1` завершается успешно;
- Scheduled Task запускает каталог `0.1.18`;
- heartbeat показывает worker `0.1.18`;
- новая удалённая задача сразу показывает prompt и финальный ответ;
- повторное открытие карточки сохраняет prompt и ответ;
- worker возвращается в `idle`, очередь пуста;
- `npm audit --omit=dev` завершается успешно.

## Порядок

1. Сохранить PID текущей пары host/worker и проверить их CommandLine.
2. Скачать onboarding package coordinator и проверить опубликованный SHA-256.
3. Распаковать package в
   `C:\Users\nikit\AppData\Local\AgentOperator\0.1.18`.
4. Запустить `install-worker.ps1` с действующей конфигурацией и
   `-UseNpmCodex`.
5. Запустить `install-codex-integration.ps1`.
6. Выполнить `diagnose.ps1` и `npm audit --omit=dev`.
7. Обновить action Scheduled Task `Agent Operator Worker` на
   `0.1.18\run-worker.ps1`, сохранив trigger, principal и settings.
8. Перезапустить Scheduled Task и проверить два последовательных heartbeat.
9. Создать одну контрольную задачу через Agent Operator.
10. Проверить prompt и ответ сразу после открытия, затем повторно открыть
    карточку.

Каталог `0.1.16` сохраняется для отката. Промежуточная версия `0.1.17`
заменяется версией `0.1.18`.
