# Windows Desktop E2E worker 0.1.15

- Дата: 2026-07-28
- Карточка: AOP-076
- Направление доставки: Mac → coordinator → Windows-worker → Codex Desktop

## Цель

Проверить, что `agent_start` создаёт новую проектную задачу, а её первый turn
принимает владелец открытого Codex Desktop на Windows.

## Обновление

- Windows-worker установлен в каталог `0.1.15`;
- Scheduled Task `Agent Operator Worker` переведена на `0.1.15`;
- переключение выполнено одноразовой Windows Scheduled Task после публикации
  результата установочного turn;
- coordinator получил два последовательных `idle` heartbeat `0.1.15`;
- очередь перед контрольным запуском была пустой.

Первоначальные дочерние PowerShell-контроллеры завершались вместе с Codex-turn
и не выполняли отложенное переключение. Устойчивым способом стала отдельная
одноразовая Windows Scheduled Task.

## Контрольный запуск

- request: `043f30ad-0741-40c9-8427-710310bb5f07`;
- project: `windows-agent-operator-worker-coordinator-worker`;
- новая задача: `019fa656-f63a-7bb0-98f5-bae1b7691cfd`;
- prompt:
  `Контроль AOP-076 для Windows Desktop: не изменяй файлы. Ответь одной строкой: WINDOWS_DESKTOP_START_015_OK`;
- result: `WINDOWS_DESKTOP_START_015_OK`;
- status: `completed`;
- время от создания request до result: `16,158 ms`;
- после результата worker вернулся в `idle / 0.1.15`.

Команда Desktop follower была принята и создала один результат. Пользователь
открыл карточку в Windows Codex Desktop и подтвердил наличие исходного prompt
и финального ответа.
