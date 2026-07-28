# Mac Desktop E2E worker 0.1.15

- Дата: 2026-07-28
- Карточка: AOP-076
- Направление доставки: coordinator → Mac-worker → Codex Desktop

## Цель

Проверить, что `agent_start` создаёт новую проектную задачу, а её первый turn
сразу выполняется владельцем открытого Codex Desktop на macOS.

## Результат

- Mac-worker перезапущен как LaunchAgent с кодом `0.1.15`;
- coordinator принял один `agent_start`;
- создана задача `019fa635-adea-72d0-9945-d2196c6b6260`;
- задача появилась в списке Codex проекта Agent Operator;
- открытая карточка содержит исходный prompt;
- turn `019fa635-dbb5-7ef3-b7ab-8138b5d65719` завершился за `2,440 ms`;
- карточка содержит финальный ответ `MAC_DESKTOP_START_015_OK`;
- coordinator получил один result со статусом `completed` и тем же
  `threadId`;
- worker вернулся в `idle`;
- приложение Codex во время проверки не перезапускалось.

## Проверка качества

Перед E2E прошли:

- typecheck;
- lint;
- 28 автоматических тестов;
- production build.
