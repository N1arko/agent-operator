# Windows Desktop E2E worker 0.1.14

Дата проверки: 2026-07-27/28. Временные метки указаны в UTC.

## Результат

Удалённый запуск нового turn в существующей сессии Codex Desktop
`019f9ff2-42a3-7c43-92e9-ab1b9794e043` работает воспроизводимо:

- prompt, прогресс и финальный ответ появляются в открытом Desktop;
- Desktop не требует перезапуска;
- один удалённый request создаёт один пользовательский turn;
- coordinator получает один completed-result с правильным `threadId`;
- worker возвращается в `idle`, локальная и серверная очереди пусты.

Coordinator и Windows-worker работали в версии `0.1.14`. Scheduled Task
`Agent Operator Worker` запускает установленный worker `0.1.14`. Версия
`0.1.13` сохранена для отката.

## Первопричина

`thread-follower-start-turn` успешно передавал turn локальному host Desktop.
После принятия команды worker запускал отдельный read-only app-server для
получения финального результата.

Пока Desktop продолжал выполнение, read-only app-server реконструировал
незавершённый rollout как:

```json
{"status":"interrupted","text":""}
```

Worker `0.1.13` считал этот статус терминальным и публиковал пустой
failed-result. Desktop продолжал выполнение и позднее сохранял тот же turn как
`completed` с корректным `agentMessage`.

В `0.1.14` `waitForTurn()` завершает ожидание только для успешных сохранённых
статусов `completed`, `complete` и `done`. Переходные представления
`interrupted`, `failed` и `cancelled` продолжают опрашиваться.

Регрессионный тест:
`does not finalize a Desktop-owned turn on transient read states`.

## Проверочные сценарии

### Короткий turn

- request: `46a41033-10c3-4914-b667-ee7d0fc326f2`;
- Desktop turn: `019fa604-a2b7-7332-a9ee-b9fbac09269d`;
- duration: `9,544 ms`;
- result: `9a920362-33b8-4c15-bd84-106fcde1aec6`;
- result status: `completed`;
- result text: `AOP_SHORT_20260727T235755Z_8C41`.

Coordinator содержит один request и один completed-result для root request.

### Turn продолжительностью более 30 секунд

- request: `0d0dd769-0ca3-41a5-b0cf-15f6a594ce20`;
- Desktop turn: `019fa605-80cc-7800-a999-cd21ecb65f1d`;
- duration: `47,860 ms`;
- progress: `PROGRESS_AOP_LONG_20260727T235755Z_C29E`;
- result: `5e0e9d1c-e6aa-4b50-8f3e-2ed472ba0ddf`;
- result status: `completed`;
- result text: `AOP_LONG_20260727T235755Z_C29E`.

Coordinator содержит один request и один completed-result для root request.

### Параллельная отзывчивость Desktop

- remote request: `6512b763-305a-4ec4-8177-058a24b42c53`;
- remote Desktop turn: `019fa60d-a692-7252-aaf3-cdede6661fad`;
- remote duration: `75,968 ms`;
- remote result: `77daabcc-fe05-479d-9d5f-b45615566bb6`;
- result status: `completed`;
- result text: `AOP_CONC_20260728T000827Z_D7B2`.

Во время remote turn отдельная существующая задача
`019fa0aa-43e7-75a3-92b4-c04d142ef599` выполнилась за `3,038 ms` и вернула
`PARALLEL_CONC_20260728T000827Z_E19A`.

## Наблюдение Desktop

Состояние исходной сессии содержало:

- короткий request: один `userMessage` и один `final_answer`;
- длинный request: один `userMessage`, один commentary и один `final_answer`;
- параллельный request: один `userMessage`, один commentary и один
  `final_answer`.

Повторных пользовательских сообщений, финальных ответов и fallback-turn не
зафиксировано.

## Очередь и heartbeat

После финального сценария:

- coordinator: `idle`;
- coordinator worker version: `0.1.14`;
- queued messages: `0`;
- local pending messages: `0`;
- `activeRequestId`: `null`;
- heartbeat `2026-07-28T00:10:32.604Z`: `idle`;
- heartbeat `2026-07-28T00:10:53.624Z`: `idle`;
- heartbeat `2026-07-28T00:11:52.749Z`: `idle`.

## Quality gate

На Windows/VPS:

- `pnpm typecheck`: passed;
- `pnpm lint`: passed;
- `pnpm test`: `27/27`;
- Windows diagnose: passed.

Повторная проверка исходников на Mac:

- `pnpm typecheck`: passed;
- `pnpm lint`: passed;
- `pnpm test`: `27/27`.

## Известное ограничение

Настоящий Desktop-turn со статусом `failed`, `cancelled` или `interrupted`
сейчас ожидается до общего 24-часового deadline. Lease и управляемая отмена
ведутся в AOP-075.
