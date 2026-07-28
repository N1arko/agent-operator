# Обновление Windows-worker до 0.1.12

## Назначение

Worker `0.1.12` сразу отправляет продолжение существующей задачи её владельцу
в ChatGPT/Codex Desktop. После принятия команды worker получает состояние
нового хода из `thread-stream-state-changed` и возвращает итоговый ответ.

Если Desktop отклоняет команду до запуска turn, worker использует прежний
`codex app-server`. Уже принятая Desktop-команда не дублируется через второй
runtime.

## Задача для Windows Codex

```text
Обнови Agent Operator worker с версии 0.1.11 до 0.1.12.

Контекст:
- coordinator:
  https://agent-operator.188-241-197-83.sslip.io;
- package:
  https://agent-operator.188-241-197-83.sslip.io/v1/onboarding/worker.zip;
- старая установка:
  C:\Users\nikit\AppData\Local\AgentOperator\0.1.11;
- новая установка:
  C:\Users\nikit\AppData\Local\AgentOperator\0.1.12;
- общий state file:
  C:\Users\nikit\AppData\Local\AgentOperator\data\worker-state.json;
- Scheduled Task:
  Agent Operator Worker;
- ожидаемый SHA-256 package будет передан основной задачей отдельно.

Выполни:
1. Дождись завершения текущего turn и проверь, что pending queue пуста.
2. Проверь CommandLine текущих процессов worker `0.1.11` и сохрани PID.
3. Загрузи package через текущую конфигурацию Agent Operator и проверь SHA-256.
4. Распакуй package в каталог `0.1.12`.
5. Запусти install-worker.ps1 с теми же coordinator, agent identity,
   projects file и npm Codex, которые использует установка `0.1.11`.
6. Обнови только action Scheduled Task `Agent Operator Worker` на
   `C:\Users\nikit\AppData\Local\AgentOperator\0.1.12\run-worker.ps1`.
7. Подготовь detached controller: после отправки итогового ответа и очистки
   pending queue он останавливает только проверенные процессы worker `0.1.11`
   и запускает Scheduled Task.
8. Проверь diagnose.ps1, npm audit --omit=dev, пустую pending queue и два
   последовательных heartbeat `0.1.12` со статусом `idle`.
9. Сохрани каталог `0.1.11` для отката.

Верни версию worker, результаты диагностики и audit, PID процессов,
два heartbeat, pending count и параметры Scheduled Task.
```
