# PROP-005: Runtime и восстановление {#root}

## Простыми словами {#plain-language}

Coordinator всегда принимает сообщения. Worker большую часть времени ждёт их
через long polling, запускает Codex по запросу, сохраняет очередь и
восстанавливается после перезапуска.

## 1. Процессы {#processes}

| Процесс | Trigger | Исполнитель | Durable state | Повтор |
| --- | --- | --- | --- | --- |
| heartbeat | interval | worker | SQLite agent snapshot | следующий interval |
| inbox poll | завершение long poll | worker | SQLite message + local pending | bounded retry |
| task execution | queued executable message | worker | pending + binding + lease | после restart до terminal |
| result publish | terminal Codex turn | worker | SQLite result | idempotent result |
| file cleanup | heartbeat/file operation/ack | coordinator + worker | file metadata | безопасный повтор |
| backup | systemd timer | VPS | SQLite snapshot | следующая попытка оператора/timer |

## 2. Очередь и дедупликация {#queue}

- Coordinator хранит durable сообщения и выдаёт их по cursor.
- На recipient допускается до трёх незавершённых запросов.
- Worker добавляет сообщение в pending state до acknowledgement.
- Один request ID исполняется один раз; result привязан к root/replyTo.
- Один активный turn блокирует следующий executable item этого worker.
- Read-only discovery requests также проходят через mailbox и имеют bounded
  результат.

## 3. Lease, отмена и ошибки {#lifecycle}

Исполняемый запрос имеет конечный lease. Истечение lease или явный cancel
останавливает активный Desktop turn, публикует терминальный результат и
освобождает очередь. Промежуточный `interrupted` read-only app-server не
считается терминальным, пока Desktop-owned turn сохраняется как активный.

## 4. Временное состояние {#state}

Bindings и pending queue переживают restart worker. Активный process handle
пересоздаётся. App-server запускается лениво и завершается после idle timeout.
Downloaded temporary files живут до result; coordinator copy — до ack или
TTL.

## 5. Восстановление {#recovery}

После старта worker:

1. загружает локальный state и projects;
2. публикует heartbeat;
3. получает durable inbox;
4. продолжает первый pending request;
5. восстанавливает thread через binding или точный thread ID;
6. публикует один terminal result.

Застрявшая работа диагностируется по agent state, active request, lease,
очереди и heartbeat. Оператор может отменить точный request либо перезапустить
локальный сервис по `docs/OPERATIONS.md`.

## 6. История изменений {#changelog}

- [2026-07-28] Зафиксирована runtime-модель версии 0.1.18.
