# Обновление Windows-worker до 0.1.23

## Цель

Закрыть FIX-003: сохранить безопасную границу между Desktop-turn после timeout
interrupt и исключить ложный `failed` при нескольких read-only наблюдателях.

## Изменения

- timeout `thread-follower-interrupt-turn` оставляет исходный turn в draining;
- следующий queued request запускается после фактического terminal boundary;
- поздний progress отменённого request больше не публикуется;
- подтверждённый interrupt завершает read-only observation перед освобождением
  очереди;
- active observation leases удерживают app-server от idle stop;
- потерянный read-only app-server перезапускается и перечитывает сохранённую
  историю thread.

## Проверки

- package SHA-256 совпадает с опубликованным значением;
- coordinator health показывает `0.1.23`;
- Scheduled Task запускает один worker из каталога `0.1.23`;
- heartbeat стабильно показывает `0.1.23`;
- timeout interrupt сохраняет следующий request в очереди до завершения
  исходного turn;
- отменённый request имеет один terminal result и ноль поздних progress update;
- `diagnose.ps1` и `npm audit --omit=dev` завершаются успешно.

## Порядок

1. Скачать onboarding package и проверить SHA-256.
2. Установить каталог `0.1.23` с действующей конфигурацией.
3. Выполнить diagnose, audit и установить bundled integration.
4. Обновить основной Scheduled Task на `0.1.23`.
5. Через отдельный отложенный процесс остановить подтверждённую пару `0.1.22`
   и запустить один основной worker `0.1.23`.
6. Проверить стабильный heartbeat и живой двусторонний E2E.

Каталог `0.1.22` сохраняется для отката.

## Опубликованный пакет

- файл: `agent-operator-worker-0.1.23.zip`;
- SHA-256:
  `505a1623c69d5a9b3566cabb3279d1eecc2d5ceb9b3fa49fc2fd4f9dd9503c74`.
