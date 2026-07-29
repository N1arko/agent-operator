# Инцидент: наложение двух follow-up в Windows Desktop

Дата наблюдения: 2026-07-28

## Наблюдение

В задаче Windows Desktop «Вынести код из хранилища» Mac-агент отправил
доуточнение дважды. Два запроса попали в одну задачу с пересечением по времени.

Coordinator-аудит содержит одну точную запись `send` с этим текстом:

```text
seq: 226
id: 643a5297-7d29-400e-ac69-85e48cf43540
kind: send
from: mac
to: windows
root: d10737cf-f8f1-4fe1-8c48-f343a01f949d
status: delivered
created: 2026-07-28T19:52:48.779Z
```

Второй путь отправки в этом срезе как отдельный `send` не найден. Для
восстановления цепочки нужны tool trace caller и delivery trace worker.

В 19:56:38Z корневой `thread_send` был отменён. Связанный `send` сохранил
статус `delivered`, а Windows worker продолжил выполнять follow-up. Для его
остановки потребовалась отдельная отмена в 20:02:47Z.

## Затронутый канон

- `spec://modules/coordinator/FEAT-002-task-coordination#followup-serialization`
- `spec://modules/worker/FEAT-005-desktop-visible-delivery#scenarios.existing`
- `spec://common/PROP-006-API#idempotency`

## Гипотезы для проверки

1. Caller выбрал два delivery path для одного intent, например `agent_send` и
   `agent_thread_send`.
2. Caller повторил вызов, пока результат первого вызова оставался неизвестным.
3. Один вызов был повторно отправлен ниже уровня MCP после частичного
   подтверждения.
4. Два самостоятельных request к одному thread начали выполняться без общей
   сериализации.
5. Cancel корневого request освободил active slot и запустил связанный
   queued follow-up того же root.

## Нужные доказательства

- caller trace с tool name, request ID и временем каждого dispatch;
- worker trace с `messageId`, `deliveryPath`, `threadId`, `turnId`, `itemId`;
- сохранённые turn items из `thread/read`;
- follower snapshot и patch item IDs;
- состояние local pending queue до и после cancel;
- coordinator chain по одному root.

Содержимое prompt и сырой command output для диагностики не требуются.

## Критерий закрытия

- Один пользовательский intent создаёт один remote request.
- Routing skill не вызывает два эквивалентных delivery tool.
- Два самостоятельных request к одному thread выполняются последовательно.
- Boundary между active и completed turn сохраняет порядок.
- Restart и retry не создают дополнительный dispatch.
- Cancel корневого request не оставляет исполняемый follow-up того же root.
- Regression test и живой Mac → Windows E2E подтверждают один input.

## Закрытие

Инцидент закрыт в 0.1.22.

- coordinator принимает caller-stable idempotency key;
- повтор одного intent возвращает исходный message ID;
- worker создаёт отдельный queued turn для каждого явного follow-up;
- root cancellation каскадно завершает outstanding follow-up;
- cancellation во время принятия Desktop-turn прерывает принятый локальный
  turn до регистрации active;
- живой E2E выполнил три request в одном thread с result cursors 453, 454 и
  455;
- для каждого request сохранён один terminal result;
- подробные доказательства:
  [`../E2E_RELEASE_0.1.22.md`](../E2E_RELEASE_0.1.22.md).
