# Обновление Windows-worker до 0.1.3

## Назначение

Worker `0.1.3` добавляет проверяемые Git-вложения для `agent_start` и
`agent_send`.

## Задача для Windows Codex

```text
Обнови Agent Operator worker с версии 0.1.2 до 0.1.3.

Контекст:
- coordinator:
  https://agent-operator.188-241-197-83.sslip.io;
- package:
  https://agent-operator.188-241-197-83.sslip.io/v1/onboarding/worker.zip;
- старая установка:
  C:\Users\nikit\AppData\Local\AgentOperator\0.1.2;
- новая установка:
  C:\Users\nikit\AppData\Local\AgentOperator\0.1.3;
- ожидаемый SHA-256 package будет передан основной задачей отдельно.

Выполни:
1. Проверь фактические CommandLine процессов worker 0.1.2. Не останавливай
   другие процессы Node.js, PowerShell или Codex.
2. Проверь `node --version` и `git --version`.
3. Загрузи прежний `worker.env` через `load-env.ps1` только в окружение
   текущего PowerShell-процесса.
4. Сохрани `$DeviceToken = $env:AOP_DEVICE_TOKEN` только в памяти процесса.
5. Скачай package с Authorization Bearer и проверь SHA-256.
6. Распакуй package в каталог 0.1.3.
7. Останови только проверенные процессы worker 0.1.2.
8. Запусти:
   .\install-worker.ps1
     -CoordinatorUrl "https://agent-operator.188-241-197-83.sslip.io"
     -AgentId "windows"
     -AgentName "Windows Codex"
     -DeviceToken $DeviceToken
     -ProjectsFile "$env:LOCALAPPDATA\AgentOperator\projects.json"
     -UseNpmCodex
9. Удали device token из окружения установочного процесса.
10. Выполни `.\diagnose.ps1`, `npm ls @openai/codex --depth=0` и
    `npm audit --omit=dev`.
11. Запусти worker через `.\run-worker.ps1`. Автозапуск пока не настраивай.
12. Сохрани каталог 0.1.2 для отката.

Верни версии worker, Node.js, Git и Codex, результаты диагностики и audit,
PID процессов, два последовательных heartbeat и предупреждения. Секреты и
содержимое worker.env в отчёт не включай.
```
