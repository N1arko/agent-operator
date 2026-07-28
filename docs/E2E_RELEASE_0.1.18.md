# Release E2E 0.1.18

Дата: 2026-07-28

## Исправление

Новая задача могла открыться в Codex Desktop между созданием thread и первым
turn. Renderer становился owner состояния с `turnCount=0`, а сохранённые prompt
и ответ появлялись только после перезапуска приложения.

Версия `0.1.17` сохраняла IPC-соединение до завершения turn. Живой Mac E2E
`019fa880-9a0d-7bb0-84b3-d61a0931d9dd` подтвердил сохранение истории и result,
при этом открытая карточка осталась пустой.

Исследование локального Desktop-протокола выявило обязательный handshake:

1. worker отправляет `thread-stream-following-changed` версии 1 с
   `following=true`;
2. worker открывает задачу и ждёт snapshot owner;
3. первый turn запускается через `thread-follower-start-turn`;
4. после терминального результата worker вызывает
   `thread-follower-load-complete-history`;
5. worker отправляет `following=false` и закрывает IPC-соединение.

Ручное применение handshake к пустой карточке `019fa880-...` сразу показало
prompt и `MAC_DESKTOP_VISIBLE_017_OK` без перезапуска приложения.

## Автоматические проверки

- typecheck: пройден;
- lint: пройден;
- tests: `33/33`;
- регрессионный тест проверяет follower handshake версии 1;
- регрессионный тест проверяет ожидание исходного snapshot;
- регрессионный тест проверяет
  `thread-follower-load-complete-history`;
- регрессионный тест проверяет закрытие IPC после завершения внешнего
  наблюдателя.

## Развёртывание

- coordinator health: `0.1.18`;
- Mac-worker: `idle / 0.1.18`;
- Windows-worker: `idle / 0.1.18`;
- package SHA-256:
  `3fae009cfd438edc1b54e7b7660e7297e4503e388cbeaae47584f2d94da6e73a`;
- Windows diagnose: HTTPS `200`, authenticated, Codex `0.145.0`, проекты
  `2/2`;
- Windows `npm audit --omit=dev`: `0` уязвимостей;
- Windows Scheduled Task направлена на `0.1.18\run-worker.ps1`;
- незавершённых исполняемых сообщений: `0`.

## Mac Desktop

- request: `1998cb32-143c-417f-833a-708450a6cbd4`;
- thread: `019fa88b-5a8b-7322-a4d9-df7ee60b909e`;
- result: `MAC_DESKTOP_HANDSHAKE_018_OK`;
- один start и один result;
- пользователь сразу увидел prompt и ответ в новой карточке;
- перезапуск Desktop не выполнялся.

## Windows Desktop

- request: `6602f1f0-837a-440b-b80a-15bba7528949`;
- thread: `019fa894-ba96-7382-a955-6b3102dad9a8`;
- result: `WINDOWS_DESKTOP_HANDSHAKE_018_OK`;
- один start и один result;
- пользователь сразу увидел prompt и ответ в новой карточке;
- перезапуск Desktop не выполнялся.

## Итог

AOP-078 завершена. Первый удалённый turn отображается в новой карточке Codex
Desktop на Mac и Windows. История сохраняется и доступна сразу после открытия.
