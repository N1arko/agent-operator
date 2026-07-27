# Обновление Windows-worker до 0.1.7

## Назначение

Worker `0.1.7` получает временные файлы из coordinator, проверяет размер и
SHA-256, передаёт Codex локальный путь и очищает копию после результата.

## Задача для Windows Codex

```text
Обнови Agent Operator worker с версии 0.1.6 до 0.1.7.

Контекст:
- coordinator:
  https://agent-operator.188-241-197-83.sslip.io;
- package:
  https://agent-operator.188-241-197-83.sslip.io/v1/onboarding/worker.zip;
- старая установка:
  C:\Users\nikit\AppData\Local\AgentOperator\0.1.6;
- новая установка:
  C:\Users\nikit\AppData\Local\AgentOperator\0.1.7;
- общий state file:
  C:\Users\nikit\AppData\Local\AgentOperator\data\worker-state.json;
- Scheduled Task:
  Agent Operator Worker;
- ожидаемый SHA-256 package будет передан основной задачей отдельно.

Выполни:
1. Проверь фактические CommandLine текущих процессов worker и сохрани их PID.
2. Загрузи package через текущую конфигурацию Agent Operator и проверь
   SHA-256.
3. Распакуй package в каталог 0.1.7.
4. Останови только проверенные процессы worker 0.1.6.
5. Запусти install-worker.ps1 с теми же coordinator, agent identity,
   projects file и npm Codex, которые использует установка 0.1.6.
6. Проверь общий AOP_STATE_FILE и новый AOP_TEMPORARY_DIR рядом с ним.
7. Выполни diagnose.ps1 и npm audit --omit=dev.
8. Обнови action Scheduled Task `Agent Operator Worker` на
   `C:\Users\nikit\AppData\Local\AgentOperator\0.1.7\run-worker.ps1` и сохрани
   остальные trigger, principal и settings.
9. Запусти worker через Scheduled Task и проверь два последовательных
   heartbeat.
10. Сохрани каталог 0.1.6 для отката.

Верни версию worker, результаты диагностики и audit, PID процессов,
два последовательных heartbeat, пути state/temp и параметры Scheduled Task.
```
