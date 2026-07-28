# Обновление Windows-worker до 0.1.14

## Назначение

Worker `0.1.14` запускает продолжение существующей задачи через её владельца
в ChatGPT/Codex Desktop. Prompt, прогресс и итоговый ответ появляются в
открытом интерфейсе. Read-only наблюдатель пропускает переходный пустой
`failed` отдельного app-server и ждёт сохранённый `completed` с финальным
сообщением.

## Задача для Windows Codex

```text
Обнови Agent Operator worker с версии 0.1.13 до 0.1.14.

Контекст:
- coordinator:
  https://agent-operator.188-241-197-83.sslip.io;
- package:
  https://agent-operator.188-241-197-83.sslip.io/v1/onboarding/worker.zip;
- старая установка:
  C:\Users\nikit\AppData\Local\AgentOperator\0.1.13;
- новая установка:
  C:\Users\nikit\AppData\Local\AgentOperator\0.1.14;
- общий state file:
  C:\Users\nikit\AppData\Local\AgentOperator\data\worker-state.json;
- Scheduled Task:
  Agent Operator Worker;
- ожидаемый SHA-256 package будет передан основной задачей отдельно.

Выполни:
1. Проверь, что текущий turn завершён и pending queue пуста.
2. Проверь CommandLine процессов worker `0.1.13` и сохрани PID.
3. Загрузи package и проверь SHA-256.
4. Распакуй package в каталог `0.1.14`.
5. Запусти install-worker.ps1 с текущими coordinator, agent identity,
   projects file и npm Codex.
6. Обнови только action Scheduled Task на
   `C:\Users\nikit\AppData\Local\AgentOperator\0.1.14\run-worker.ps1`.
7. После завершения текущего turn останови только проверенные процессы
   `0.1.13`, запусти Scheduled Task и проверь diagnose.ps1,
   npm audit --omit=dev, пустую очередь и два heartbeat `idle` версии 0.1.14.
8. Сохрани каталог `0.1.13` для отката.

Верни результаты установки и два heartbeat.
```
