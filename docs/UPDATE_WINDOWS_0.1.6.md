# Обновление Windows-worker до 0.1.6

## Назначение

Worker `0.1.6` сохраняет очередь между версиями, исключает повтор завершённых
сообщений и запускает Codex turn до открытия задачи в ChatGPT Desktop.

## Задача для Windows Codex

```text
Обнови Agent Operator worker с версии 0.1.5 до 0.1.6.

Контекст:
- coordinator:
  https://agent-operator.188-241-197-83.sslip.io;
- package:
  https://agent-operator.188-241-197-83.sslip.io/v1/onboarding/worker.zip;
- старая установка:
  C:\Users\nikit\AppData\Local\AgentOperator\0.1.5;
- новая установка:
  C:\Users\nikit\AppData\Local\AgentOperator\0.1.6;
- общий state file:
  C:\Users\nikit\AppData\Local\AgentOperator\data\worker-state.json;
- ожидаемый SHA-256 package будет передан основной задачей отдельно.

Выполни:
1. Проверь фактические CommandLine текущих процессов worker и сохрани их PID.
2. Загрузи package через текущую конфигурацию Agent Operator и проверь
   SHA-256.
3. Распакуй package в каталог 0.1.6.
4. Останови только проверенные процессы worker 0.1.5.
5. Запусти install-worker.ps1 с теми же coordinator, agent identity,
   projects file и npm Codex, которые использует установка 0.1.5.
6. Проверь, что AOP_STATE_FILE указывает на общий state file вне каталога
   версии.
7. Выполни diagnose.ps1 и npm audit --omit=dev.
8. Запусти worker через run-worker.ps1. Автозапуск пока не настраивай.
9. Сохрани каталог 0.1.5 для отката.

Верни версию worker, результаты диагностики и audit, PID процессов,
два последовательных heartbeat, путь AOP_STATE_FILE и предупреждения.
```
