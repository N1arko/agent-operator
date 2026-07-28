# Обновление Windows-worker до 0.1.13

## Назначение

Worker `0.1.13` запускает продолжение существующей задачи через её владельца
в ChatGPT/Codex Desktop. Prompt, прогресс и итоговый ответ появляются в
открытом интерфейсе. После принятия команды worker читает сохранённый turn
через локальный app-server и передаёт его результат coordinator.

## Задача для Windows Codex

```text
Восстанови Agent Operator после зависшего учёта завершённого E2E и обнови
worker с версии 0.1.12 до 0.1.13.

Контекст:
- coordinator:
  https://agent-operator.188-241-197-83.sslip.io;
- package:
  https://agent-operator.188-241-197-83.sslip.io/v1/onboarding/worker.zip;
- старая установка:
  C:\Users\nikit\AppData\Local\AgentOperator\0.1.12;
- новая установка:
  C:\Users\nikit\AppData\Local\AgentOperator\0.1.13;
- общий state file:
  C:\Users\nikit\AppData\Local\AgentOperator\data\worker-state.json;
- Scheduled Task:
  Agent Operator Worker;
- зависшее message ID:
  f94e79ed-6a76-4ab8-a485-cbdbcaa9721f;
- ожидаемый SHA-256 package будет передан основной задачей отдельно.

Выполни:
1. Проверь, что Desktop-turn для зависшего message ID уже завершён и его
   финальный текст равен WINDOWS_DESKTOP_VISIBLE_OK.
2. Останови только проверенные процессы worker `0.1.12` через Scheduled Task.
3. Создай резервную копию общего state file.
4. Удали из `pendingMessages` только запись с указанным message ID. Cursor,
   thread bindings и остальные поля сохрани.
5. Загрузи package и проверь SHA-256.
6. Распакуй package в каталог `0.1.13`.
7. Запусти install-worker.ps1 с текущими coordinator, agent identity,
   projects file и npm Codex.
8. Обнови только action Scheduled Task на
   `C:\Users\nikit\AppData\Local\AgentOperator\0.1.13\run-worker.ps1`.
9. Запусти Scheduled Task и проверь diagnose.ps1, npm audit --omit=dev,
   пустую pending queue и два последовательных heartbeat `0.1.13` со
   статусом `idle`.
10. Сохрани каталог `0.1.12` и резервную копию state для отката.

Верни результаты проверки, установки и два heartbeat.
```
