# ADR-0014: Последовательные follow-up и поток progress

Дата: 2026-07-28
Статус: принято

## Контекст

Активный headless turn принимал follow-up через `turn/steer`, а Desktop-owned
turn принимал следующий request через очередь. Один продуктовый контракт имел
два разных способа доставки. При повторной отправке caller мог создать
пересекающиеся input, а отмена root не завершала связанные queued follow-up.

Отправитель также видел только terminal result. Длительная работа оставалась
без содержательной обратной связи, хотя app-server и Desktop follower уже
получали commentary, план и lifecycle items.

## Решение

Каждый удалённый request создаёт отдельный turn. Follow-up одного thread
исполняются в очереди после завершения активного turn. Caller передаёт
стабильный idempotency key одного пользовательского intent; coordinator
возвращает исходный message при сетевом повторе. Отмена root каскадно завершает
его outstanding follow-up.

Worker публикует commentary, plan snapshot и компактную activity как
idempotent `update`. Update имеет `isFinal: false` и общий cursor с result.
Только terminal turn создаёт `result` с `isFinal: true`. Reasoning и полный
command output не публикуются.

Автоматический выбор выполнения сохраняет стабильный профиль `fast`,
`balanced` или `deep`, runtime model/reasoning и краткую причину. Exact values
разрешаются из актуального каталога recipient.

Inbox poll атомарно claim-ит queued message до отправки HTTP-ответа. Claim
освобождается по короткому lease, если worker не успел подтвердить сохранение
в pending state. Это сохраняет восстановление после сетевого сбоя и исключает
одновременную выдачу двум процессам одной identity.

Если cancellation приходит во время асинхронного принятия Desktop-turn, worker
проверяет settled request до регистрации active. Уже принятый локальный turn
прерывается, temporary state освобождается, очередь продолжает выполнение.

## Последствия

- один пользовательский intent создаёт один input;
- две явные команды к одной задаче имеют два последовательных turn;
- cancel root освобождает связанную очередь;
- progress и final имеют однозначную машинную границу;
- retry request и update безопасен;
- cancellation на startup boundary не удерживает active slot;
- activity ограничена по частоте, один request хранит не более 200 update;
- routing rules не зависят от названий поколений моделей.
