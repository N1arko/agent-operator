# Обновление Windows-worker до 0.1.9

## Назначение

Worker `0.1.9` обновляет Codex Desktop после запуска и после завершения
внешнего turn. События перечитывают список задач и конкретный открытый thread.
Ошибки локального IPC записываются в stderr worker.

## Задача для Windows Codex

```text
Обнови Agent Operator worker с версии 0.1.8 до 0.1.9.

Контекст:
- coordinator:
  https://agent-operator.188-241-197-83.sslip.io;
- package:
  https://agent-operator.188-241-197-83.sslip.io/v1/onboarding/worker.zip;
- старая установка:
  C:\Users\nikit\AppData\Local\AgentOperator\0.1.8;
- новая установка:
  C:\Users\nikit\AppData\Local\AgentOperator\0.1.9;
- общий state file:
  C:\Users\nikit\AppData\Local\AgentOperator\data\worker-state.json;
- Scheduled Task:
  Agent Operator Worker;
- ожидаемый SHA-256 package будет передан основной задачей отдельно.

Выполни:
1. Проверь CommandLine текущих процессов worker `0.1.8` и сохрани PID.
2. Загрузи package через текущую конфигурацию Agent Operator и проверь SHA-256.
3. Распакуй package в каталог `0.1.9`.
4. Останови только проверенные процессы worker `0.1.8`.
5. Запусти install-worker.ps1 с теми же coordinator, agent identity,
   projects file и npm Codex, которые использует установка `0.1.8`.
6. Проверь общий state: cursor сохранён, pending queue пуста, thread bindings
   не изменились.
7. Выполни diagnose.ps1 и npm audit --omit=dev.
8. Обнови только action Scheduled Task `Agent Operator Worker` на
   `C:\Users\nikit\AppData\Local\AgentOperator\0.1.9\run-worker.ps1`.
9. Запусти worker через Scheduled Task и проверь два последовательных
   heartbeat со статусом `idle`.
10. Сохрани каталог `0.1.8` для отката.

Верни версию worker, результаты диагностики и audit, PID процессов,
два heartbeat, pending count и параметры Scheduled Task.
```
