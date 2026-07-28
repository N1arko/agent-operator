# Обновление Windows-worker до 0.1.15

## Назначение

Worker `0.1.15` передаёт владельцу Codex Desktop первый turn новой задачи,
созданной через `agent_start`. Пользователь сразу видит prompt, выполнение и
ответ в открытом приложении. Платформенный endpoint Desktop выбирается
автоматически.

## Задача для Windows Codex

```text
Обнови Agent Operator worker с версии 0.1.14 до 0.1.15.

Контекст:
- coordinator:
  https://agent-operator.188-241-197-83.sslip.io;
- package:
  https://agent-operator.188-241-197-83.sslip.io/v1/onboarding/worker.zip;
- старая установка:
  C:\Users\nikit\AppData\Local\AgentOperator\0.1.14;
- новая установка:
  C:\Users\nikit\AppData\Local\AgentOperator\0.1.15;
- общий state file:
  C:\Users\nikit\AppData\Local\AgentOperator\data\worker-state.json;
- Scheduled Task:
  Agent Operator Worker;
- ожидаемый SHA-256 package будет передан основной задачей отдельно.

Выполни:
1. Проверь, что текущий turn завершён и pending queue пуста.
2. Проверь CommandLine процессов worker 0.1.14 и сохрани PID.
3. Загрузи package и проверь SHA-256.
4. Распакуй package в каталог 0.1.15.
5. Запусти install-worker.ps1 с текущими coordinator, agent identity,
   projects file и npm Codex.
6. Обнови action Scheduled Task на
   C:\Users\nikit\AppData\Local\AgentOperator\0.1.15\run-worker.ps1.
7. После завершения текущего turn останови только проверенные процессы
   0.1.14, запусти Scheduled Task и проверь diagnose.ps1,
   npm audit --omit=dev, пустую очередь и два heartbeat idle версии 0.1.15.
8. Сохрани каталог 0.1.14 для отката.

После обновления оставь Codex Desktop открытым. Сообщи, что worker готов к
одному контрольному agent_start. Самостоятельно новые тестовые задачи не
создавай.

Верни результаты установки и два heartbeat.
```
