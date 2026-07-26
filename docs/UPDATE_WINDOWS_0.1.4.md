# Обновление Windows-worker до 0.1.4

## Назначение

Worker `0.1.4` добавляет ограниченный поиск локальных задач Codex и запуск
нового turn в существующей задаче по точному `threadId`.

## Задача для Windows Codex

```text
Обнови Agent Operator worker с версии 0.1.3 до 0.1.4.

Контекст:
- coordinator:
  https://agent-operator.188-241-197-83.sslip.io;
- package:
  https://agent-operator.188-241-197-83.sslip.io/v1/onboarding/worker.zip;
- старая установка:
  C:\Users\nikit\AppData\Local\AgentOperator\0.1.3;
- новая установка:
  C:\Users\nikit\AppData\Local\AgentOperator\0.1.4;
- ожидаемый SHA-256 package будет передан основной задачей отдельно.

Выполни:
1. Проверь фактические CommandLine процессов worker 0.1.3 и сохрани их PID.
2. Проверь версии Node.js, Git и Codex.
3. Загрузи package через текущую конфигурацию Agent Operator и проверь
   SHA-256.
4. Распакуй package в каталог 0.1.4.
5. Останови только проверенные процессы worker 0.1.3.
6. Запусти install-worker.ps1 с теми же coordinator, agent identity,
   projects file и npm Codex, которые использует установка 0.1.3.
7. Выполни diagnose.ps1, npm ls @openai/codex --depth=0 и
   npm audit --omit=dev.
8. Запусти worker через run-worker.ps1. Автозапуск пока не настраивай.
9. Сохрани каталог 0.1.3 для отката.

Верни версии worker, Node.js, Git и Codex, результаты диагностики и audit,
PID процессов, два последовательных heartbeat и предупреждения.
```
