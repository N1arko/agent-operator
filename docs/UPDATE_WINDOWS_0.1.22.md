# Обновление Windows-worker до 0.1.22

## Цель

Закрыть гонку отмены во время запуска Desktop-turn. Если cancellation приходит
после получения request и до регистрации active turn, worker прерывает уже
принятый Desktop-turn, освобождает очередь и продолжает со следующим request.

Версия также включает atomic inbox claim, сериализацию follow-up,
промежуточные обновления и профили выбора модели из 0.1.19–0.1.21.

## Проверки

- package SHA-256 совпадает с опубликованным значением;
- coordinator health показывает `0.1.22`;
- Scheduled Task запускает один worker из каталога `0.1.22`;
- heartbeat стабильно показывает только `0.1.22`;
- cancellation во время принятия Desktop-turn прерывает этот turn;
- следующий queued request начинает выполняться без перезапуска worker;
- один request создаёт один Desktop-turn и один terminal result;
- progress приходит с `isFinal: false`, terminal result — с `isFinal: true`;
- `diagnose.ps1` и `npm audit --omit=dev` завершаются успешно.

## Порядок

1. Скачать onboarding package и проверить SHA-256.
2. Установить каталог `0.1.22` с действующей конфигурацией.
3. Выполнить diagnose, audit и установить bundled integration.
4. Обновить основной Scheduled Task на `0.1.22`.
5. Через отдельный отложенный процесс остановить подтверждённую пару `0.1.21`
   и запустить один основной worker `0.1.22`.
6. Проверить стабильный heartbeat и живой двусторонний E2E.

Каталог `0.1.21` сохраняется для отката.
