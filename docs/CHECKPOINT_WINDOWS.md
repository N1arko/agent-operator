# CP-WIN-01: подключение Windows-worker

## 1. Назначение

Checkpoint подключает реальный Windows-ноутбук и второй аккаунт Codex к
coordinator на `clawvpn`.

До checkpoint разработка и протокольные тесты выполняются локально. После
checkpoint начинается реальный end-to-end сценарий Mac ↔ Windows.

## 2. Когда наступает checkpoint

Основной Codex переходит к checkpoint после выполнения всех условий:

- coordinator работает локально и на `clawvpn`;
- HTTPS endpoint доступен;
- Mac-worker подключён;
- `agents_list`, `agent_status`, `agent_projects`, `agent_start`, `agent_send` и
  `agent_wait` реализованы;
- готов Windows-compatible worker package;
- готова диагностическая команда;
- device token можно создать и безопасно передать на Windows;
- локальные protocol tests проходят.

При невыполненном условии checkpoint остаётся ожидающим.

**Текущий статус 2026-07-26:** все входные условия выполнены. Checkpoint готов
к действиям пользователя.

## 3. Что требуется от пользователя

В момент checkpoint пользователь:

1. Включает Windows-ноутбук и подключает его к интернету.
2. Запускает Codex под нужным вторым аккаунтом.
3. Открывает локальный проект, из которого удобно выполнить установку.
4. Передаёт Windows Codex подготовленную задачу.
5. Вводит device token локально, когда Windows Codex запросит его.

Device token не вставляется в prompt, Git, логи или отчёт.

## 4. Что подготавливает основной Codex

Непосредственно перед checkpoint основной Codex формирует актуальную задачу.
Она должна содержать:

- цель подключения;
- точную версию worker;
- способ получения worker package;
- публичный HTTPS URL coordinator;
- желаемые `agentId` и display name;
- команды установки и запуска;
- расположение локального config и secret storage;
- команду диагностики;
- критерии успешного подключения;
- формат итогового отчёта;
- ограничения на изменения локальных проектов.

Значения берутся из фактической реализации. Статический шаблон ниже служит
структурой и не отправляется без актуализации.

## 5. Актуальная задача для Windows Codex

```text
Ты работаешь на Windows-ноутбуке. Подключи локальный Agent Operator worker к
работающему coordinator. Выполни задачу самостоятельно и остановись, если
потребуется выбор пользователя или безопасный ввод секрета.

Цель:
- установить worker версии 0.1.0;
- подключить его к
  https://agent-operator.188-241-197-83.sslip.io;
- зарегистрировать agentId `windows` с именем `Windows Codex`;
- опубликовать доступные локальные Codex-проекты;
- пройти диагностику и вернуть отчёт.

Контекст:
- health:
  https://agent-operator.188-241-197-83.sslip.io/health
- package:
  https://agent-operator.188-241-197-83.sslip.io/v1/onboarding/worker.zip
- install directory:
  `$env:LOCALAPPDATA\AgentOperator\0.1.0`
- package содержит `install-worker.ps1`, `diagnose.ps1` и `run-worker.ps1`;
- device token уже создан на coordinator. Запроси его у пользователя через
  скрытый локальный ввод. Не включай token в сообщение, командный вывод или
  отчёт.

Правила:
1. Проверь Windows, архитектуру, `node --version` и `codex --version`.
   Требуется Node.js 24 или новее.
2. Сохрани проекты на месте. Для первоначальной проверки выбери текущий
   открытый в Codex проект. Если текущий проект не определён, покажи
   пользователю короткий список вероятных папок и попроси выбрать одну.
3. Создай `$env:LOCALAPPDATA\AgentOperator\projects.json`. Для каждого проекта
   сгенерируй случайный стабильный ID через `[guid]::NewGuid()`, запиши
   отображаемое имя, абсолютный локальный path и tags. Эти ID сохраняются при
   дальнейшем переименовании или переносе папки.
4. Получи token через:
   `$SecureToken = Read-Host "Device token" -AsSecureString`.
   Преобразуй его в обычную строку только в памяти текущего PowerShell-процесса.
5. Скачай package с заголовком
   `Authorization: Bearer <token>` через `Invoke-WebRequest`, распакуй в
   install directory.
6. Запусти:
   `.\install-worker.ps1 -CoordinatorUrl "https://agent-operator.188-241-197-83.sslip.io" -AgentId "windows" -AgentName "Windows Codex" -DeviceToken $DeviceToken -ProjectsFile "$env:LOCALAPPDATA\AgentOperator\projects.json"`.
7. Удали переменные с token из текущего PowerShell-сеанса.
8. Проверь `.\diagnose.ps1`. Успешная диагностика должна показать HTTPS 200,
   `authenticated: true`, доступный Codex и хотя бы один доступный проект.
9. Запусти worker отдельным локальным процессом через `.\run-worker.ps1`.
   Автозапуск в этом checkpoint не настраивай.
10. Сообщи пользователю, что worker запущен, и дождись проверки с Mac.
11. При ошибке авторизации, недоступном пути или несовместимой версии остановись
    и верни точный безопасный текст ошибки.

Успешный результат:
- worker подключён;
- агент виден как idle;
- agent_projects возвращает проекты;
- тестовый agent_start может быть принят;
- секреты отсутствуют в выводе.

Верни:
- версию worker `0.1.0`;
- Windows version и architecture;
- Codex и Node.js versions;
- статус coordinator connection и `authenticated`;
- agentId и количество опубликованных проектов;
- путь к install directory и projects config;
- статус worker process;
- предупреждения и необходимые ручные действия.
```

Device token хранится на основном Mac в исключённом из Git файле
`work/windows.token` с правами `0600`. Пользователь передаёт его только в
скрытый prompt `Read-Host` на Windows.

## 6. Проверка со стороны основного Codex

После запуска Windows-worker основной Codex:

1. Проверяет `agents_list`.
2. Проверяет `agent_status` Windows-agent.
3. Вызывает `agent_projects`.
4. Выбирает безопасный тестовый проект.
5. Запускает короткий `agent_start`.
6. Ждёт результат через `agent_wait`.
7. Просит перезапустить worker.
8. Проверяет восстановление heartbeat и доступности проектов.

## 7. Критерии завершения

Checkpoint завершён, когда:

- Windows-worker стабильно подключён;
- второй аккаунт подтверждён;
- проекты публикуются без передачи абсолютных путей;
- свежий thread запускается в выбранном проекте;
- ответ возвращается на Mac;
- restart не требует повторной регистрации;
- токены отсутствуют в Git и логах.

## 8. Действия при блокере

Основной Codex сохраняет:

- этап возникновения ошибки;
- безопасный текст ошибки;
- версии worker, Codex и Windows;
- результат диагностики;
- состояние heartbeat.

После исправления checkpoint повторяется с шага, на котором произошёл сбой.
