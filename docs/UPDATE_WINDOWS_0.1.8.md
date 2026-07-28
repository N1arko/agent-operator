# Обновление Windows-worker до 0.1.8

## Назначение

Worker `0.1.8` отправляет Codex Desktop локальное событие обновления после
запуска или продолжения внешней задачи. Приложение перечитывает список задач и
конкретный открытый thread без перезапуска.

## Задача для Windows Codex

```text
Обнови Agent Operator worker с версии 0.1.7 до 0.1.8.

Контекст:
- coordinator:
  https://agent-operator.188-241-197-83.sslip.io;
- package:
  https://agent-operator.188-241-197-83.sslip.io/v1/onboarding/worker.zip;
- старая установка:
  C:\Users\nikit\AppData\Local\AgentOperator\0.1.7;
- новая установка:
  C:\Users\nikit\AppData\Local\AgentOperator\0.1.8;
- общий state file:
  C:\Users\nikit\AppData\Local\AgentOperator\data\worker-state.json;
- Scheduled Task:
  Agent Operator Worker;
- ожидаемый SHA-256 package будет передан основной задачей отдельно.

Выполни:
1. Проверь CommandLine текущих процессов Agent Operator worker и сохрани PID.
2. Если worker выполняет старый turn без прогресса, останови только
   проверенные host/worker-процессы и не запускай старую задачу повторно до
   отдельного решения по её отмене.
3. Загрузи package через текущую конфигурацию Agent Operator и проверь SHA-256.
4. Распакуй package в каталог 0.1.8.
5. Запусти install-worker.ps1 с теми же coordinator, agent identity,
   projects file и npm Codex, которые использует установка 0.1.7.
6. Проверь общий AOP_STATE_FILE и AOP_TEMPORARY_DIR.
7. Выполни diagnose.ps1 и npm audit --omit=dev.
8. Обнови action Scheduled Task `Agent Operator Worker` на
   `C:\Users\nikit\AppData\Local\AgentOperator\0.1.8\run-worker.ps1` и сохрани
   остальные trigger, principal и settings.
9. Перед запуском покажи список pending message ID из общего state file.
   Не удаляй записи без отдельной команды.
10. После согласования pending queue запусти worker через Scheduled Task и
    проверь два последовательных heartbeat.
11. Сохрани каталог 0.1.7 для отката.

Верни версию worker, результаты диагностики и audit, PID процессов,
pending message ID, два heartbeat и параметры Scheduled Task.
```
