# Обновление Windows-worker до 0.1.11

## Назначение

Worker `0.1.11` продолжает существующую задачу через командный IPC самого
ChatGPT/Codex Desktop. Приложение запускает turn своим локальным host, а worker
получает prompt, прогресс и итоговый ответ из штатного потока
`thread-stream-state-changed`.

Если Desktop недоступен до запуска turn, worker использует прежний
`codex app-server`. Уже принятая Desktop-команда не дублируется через второй
runtime.

## Задача для Windows Codex

```text
Обнови Agent Operator worker с версии 0.1.10 до 0.1.11.

Контекст:
- coordinator:
  https://agent-operator.188-241-197-83.sslip.io;
- package:
  https://agent-operator.188-241-197-83.sslip.io/v1/onboarding/worker.zip;
- старая установка:
  C:\Users\nikit\AppData\Local\AgentOperator\0.1.10;
- новая установка:
  C:\Users\nikit\AppData\Local\AgentOperator\0.1.11;
- общий state file:
  C:\Users\nikit\AppData\Local\AgentOperator\data\worker-state.json;
- Scheduled Task:
  Agent Operator Worker;
- ожидаемый SHA-256 package будет передан основной задачей отдельно.

Выполни:
1. Дождись завершения текущего turn и проверь, что pending queue пуста.
2. Проверь CommandLine текущих процессов worker `0.1.10` и сохрани PID.
3. Загрузи package через текущую конфигурацию Agent Operator и проверь SHA-256.
4. Распакуй package в каталог `0.1.11`.
5. Запусти install-worker.ps1 с теми же coordinator, agent identity,
   projects file и npm Codex, которые использует установка `0.1.10`.
6. Обнови только action Scheduled Task `Agent Operator Worker` на
   `C:\Users\nikit\AppData\Local\AgentOperator\0.1.11\run-worker.ps1`.
7. Подготовь detached controller: после отправки итогового ответа и очистки
   pending queue он останавливает только проверенные процессы worker `0.1.10`
   и запускает Scheduled Task.
8. Проверь diagnose.ps1, npm audit --omit=dev, пустую pending queue и два
   последовательных heartbeat `0.1.11` со статусом `idle`.
9. Сохрани каталог `0.1.10` для отката.

Верни версию worker, результаты диагностики и audit, PID процессов,
два heartbeat, pending count и параметры Scheduled Task.
```
