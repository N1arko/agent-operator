# Канбан Agent Operator

Обновлено: 2026-07-27

Цель MVP: два Codex с разными аккаунтами видят состояние друг друга,
выбирают локальный проект, запускают свежую работу, обмениваются сообщениями и
автоматически получают результат.

В колонке «В работе» находится одна основная инженерная карточка.

## В работе

### AOP-074 — Подключить Agent Operator к обычным чатам Codex

Coordinator реализует Streamable HTTP MCP, а текущие E2E запускаются
отдельными техническими клиентами из репозитория. В конфигурации
ChatGPT/Codex на Mac Agent Operator отсутствует. Обычный чат пока не видит
инструменты и не умеет связать фразу «сделай на Маке» с agent `mac`.

Нужно:

- подключить coordinator как MCP `agent-operator` в Codex на Mac и Windows;
- проверить появление инструментов через локальную диагностику Codex;
- создать routing skill для запросов о другом компьютере или агенте;
- описать алиасы `Mac`, `макбук`, `Windows`, `виндоус-ноутбук`;
- задать последовательность `agents_list → agent_status/agent_projects →
  agent_start/agent_thread_send → agent_wait`;
- установить skill для projectless и project-based чатов обоих аккаунтов;
- выполнить Windows → Mac и Mac → Windows E2E из обычных чатов;
- исключить вспомогательные Node.js-клиенты из итогового пользовательского
  сценария.

Карточка завершается, когда пользователь может открыть новый чат на Windows,
сказать «сделай это на Маке», а Codex самостоятельно найдёт `mac`, отправит
работу и вернёт результат.

## Ожидает платформенного решения

### AOP-073 — Безопасно показывать удалённую работу в ChatGPT Desktop

Каждый удалённый запуск и продолжение должны открывать соответствующую задачу
в приложении ChatGPT/Codex на принимающем Mac или Windows. Новая задача
получает заметный заголовок, а result содержит её `threadId`.

Windows E2E выявил повтор исторических сообщений после смены каталога версии и
гонку при открытии thread до `turn/start`. Версия `0.1.6` хранит durable
pending queue в общем каталоге, выдаёт worker только `queued` сообщения,
ограничивает backlog и открывает Desktop после запуска turn.

Coordinator, Mac-worker и Windows-worker обновлены до `0.1.6`. Контрольный
Windows turn вернул `WINDOWS_DESKTOP_VISIBLE_016_OK`, worker остался `idle`,
backlog равен нулю.

Desktop E2E провален. В существующем thread
`019fa029-b404-7d03-9896-d2d2fbcedcba` worker выполнил запрос `А сейчас?` и
получил ответ, а открытая Windows-вкладка не показала prompt и result после
переключения между задачами. Следующий шаг описан в ADR-0008: turn должен
запускаться через runtime ChatGPT Desktop.

После полного перезапуска приложения prompt и result появились в исходной
задаче. Общая история подтверждена; требуется устранить in-memory разрыв между
двумя app-server без ручного перезапуска Desktop.

Текущие публичные интерфейсы не дают worker подключиться вторым клиентом к
stdio app-server, запущенному Desktop. Карточка возвращается в работу после
появления поддерживаемого shared endpoint или другого Desktop-native пути без
UI-автоматизации.

## Ближайший порядок

1. **AOP-074:** подключить MCP и routing skill к обычным чатам.
2. **AOP-084, AOP-091:** включить backup SQLite и подготовить инструкцию
   эксплуатации.
3. **AOP-073:** вернуться к live-обновлению Desktop при появлении чистого
   интеграционного пути.

## Контрольные точки

### CP-WIN-01 — Подключить реальный Windows-ноутбук

**Статус:** завершён 2026-07-26.

Входные критерии:

- [x] Локальный вертикальный сценарий проходит на двух тестовых agent identities.
- [x] Coordinator развёрнут на `clawvpn` и доступен по HTTPS.
- [x] Mac-worker подключён и виден через `agents_list`.
- [x] Готов Windows-compatible worker package и диагностическая команда.
- [x] Реализованы device token, `agent_projects`, `agent_start` и `agent_wait`.
- [x] Сформирован актуальный prompt для Windows Codex по
  `docs/CHECKPOINT_WINDOWS.md`.

Действия в checkpoint:

1. Codex проверяет входные критерии и формирует задачу с фактическими URL,
   командами и версией worker.
2. Пользователь включает Windows-ноутбук, запускает Codex в нужном аккаунте и
   передаёт ему подготовленную задачу.
3. Windows Codex устанавливает worker, получает device token через безопасный
   локальный ввод и запускает диагностику.
4. Основной Codex наблюдает подключение через coordinator.

Выходные критерии:

- [x] Windows-worker присылает heartbeat.
- [x] `agents_list` показывает Windows-agent как `idle`.
- [x] `agent_projects` возвращает локальные Windows-проекты.
- [x] Тестовый `agent_start` запускает свежий thread в выбранном проекте.
- [x] Результат возвращается через `agent_wait`.
- [x] Перезапуск Windows-worker восстанавливает подключение.

## Далее

### Основа

- [x] **AOP-002:** Инициализировать TypeScript workspace.
- [x] **AOP-003:** Добавить typecheck, lint и tests.
- [x] **AOP-004:** Описать схемы `Agent`, `ProjectDescriptor`, `Message` и
  `Attachment`.
- [x] **AOP-005:** Добавить SQLite и таблицы agents, agent_projects, messages,
  temporary_files.
- [x] **AOP-006:** Поднять coordinator с health endpoint.

### Presence и mailbox

- [x] **AOP-010:** Реализовать agent token.
- [x] **AOP-011:** Реализовать регистрацию и heartbeat.
- [x] **AOP-012:** Реализовать online, idle, busy и offline.
- [x] **AOP-013:** Реализовать current project и current activity.
- [x] **AOP-014:** Реализовать durable message queue.
- [x] **AOP-015:** Реализовать `replyTo` и статусы доставки.
- [x] **AOP-016:** Реализовать cursor для ожидания обновлений.
- [x] **AOP-017:** Реализовать кэш project descriptors без локальных путей.

### MCP

- [x] **AOP-020:** Поднять Streamable HTTP MCP.
- [x] **AOP-021:** Реализовать `agents_list`.
- [x] **AOP-022:** Реализовать `agent_status`.
- [x] **AOP-023:** Реализовать `agent_projects`.
- [x] **AOP-024:** Реализовать `agent_start`.
- [x] **AOP-025:** Реализовать `agent_send`.
- [x] **AOP-026:** Реализовать `agent_wait`.
- [ ] **AOP-074:** Подключить MCP и routing skill к обычным чатам Codex на
  обоих компьютерах.

### Worker

- [x] **AOP-030:** Создать CLI-worker.
- [x] **AOP-031:** Реализовать local identity и конфигурацию.
- [x] **AOP-032:** Реализовать heartbeat и long polling.
- [x] **AOP-033:** Получать или формировать локальный project registry.
- [x] **AOP-034:** Публиковать project descriptors.
- [x] **AOP-035:** Разрешать project ID в primary folder и дополнительные roots.
- [x] **AOP-036:** Реализовать lazy lifecycle app-server.
- [x] **AOP-037:** Хранить `rootMessageId → threadId + projectId`.
- [x] **AOP-038:** Выводить status из событий turn.
- [x] **AOP-039:** Выводить безопасный current activity.
- [x] **AOP-040:** Реализовать один активный turn.
- [x] **AOP-041:** Реализовать очередь `agent_start`.
- [x] **AOP-042:** Доставлять связанное сообщение в нужную сессию.
- [x] **AOP-043:** Автоматически отправлять result после завершения.
- [x] **AOP-044:** Восстанавливать состояние после перезапуска.

### Передача файлов

- [x] **AOP-052:** Добавить upload временного файла.
- [x] **AOP-053:** Добавить download во временную локальную папку.
- [x] **AOP-054:** Проверять size и SHA-256.
- [x] **AOP-055:** Добавить TTL и автоматическое удаление.
- [x] **AOP-056:** Добавить лимит размера и quota.

### Вертикальный MVP

- [x] **AOP-060:** Поднять coordinator и два worker локально.
- [x] **AOP-061:** Запустить два тестовых agent identities на локальном
  coordinator.
- [x] **AOP-062:** Проверить `agents_list` и `agent_status`.
- [x] **AOP-063:** Получить проекты через `agent_projects`.
- [x] **AOP-064:** Запустить свежую работу в выбранном проекте.
- [x] **AOP-065:** Поставить новый запуск занятому агенту.
- [x] **AOP-066:** Передать связанное сообщение активному агенту.
- [x] **AOP-067:** Продолжить завершённый thread через `replyTo`.
- [x] **AOP-068:** Получить автоматический result.
- [x] **AOP-069:** Дождаться результата через cursor.
- [x] **AOP-071:** Передать временный файл.
- [x] **AOP-072:** Проверить restart и resume.

### VPS

- [x] **AOP-080:** Снять профиль сервера `clawvpn`.
- [x] **AOP-081:** Подготовить container image coordinator.
- [x] **AOP-082:** Подготовить deployment рядом с существующими контейнерами.
- [x] **AOP-083:** Настроить data directory.
- [ ] **AOP-084:** Настроить backup SQLite.
- [x] **AOP-085:** Настроить Caddy и HTTPS на свободных 80/443.
- [x] **AOP-086:** Установить worker на macOS.
- [x] **AOP-087:** Подготовить Windows package, диагностику и актуальный prompt.
- [ ] **AOP-091:** Подготовить инструкцию эксплуатации.
- [x] **AOP-092:** Настроить автозапуск и восстановление Windows-worker.

## Позже

- [ ] **AOP-100:** Уведомления.
- [ ] **AOP-101:** Web-интерфейс.
- [ ] **AOP-102:** Несколько активных turns.
- [ ] **AOP-104:** Автоматическая оркестрация нескольких агентов.
- [ ] **AOP-105:** Расписания.
- [ ] **AOP-106:** Нативная упаковка и автообновление.
- [ ] **AOP-107:** Многопользовательские права.
- [ ] **AOP-108:** S3 при подтверждённом объёме файлов.
- [ ] **AOP-109:** PostgreSQL при подтверждённой нагрузке.

## Готово

### 2026-07-25

- [x] **AOP-000:** Создан первоначальный проектный черновик.
- [x] **AOP-000A:** Проверена модель coordinator и локальных worker.
- [x] **AOP-000B:** Архитектура сведена к mailbox, presence, запуску,
  автоматическому результату и двум способам передачи файлов.

### 2026-07-26

- [x] **AOP-000C:** API уточнён до `agents_list`, `agent_status`,
  `agent_projects`, `agent_start`, `agent_send`, `agent_wait`.
- [x] **AOP-000D:** Зафиксирован deployment target `clawvpn` и его фактический
  профиль ресурсов.
- [x] **AOP-000E:** Зафиксирован обязательный `CP-WIN-01` с подготовкой задачи
  для Windows Codex.
- [x] **AOP-001:** Проверены app-server schemas, свежий thread с выбранным
  `cwd`, status events, steering, финальный результат, restart/resume и
  нагрузка. Решение зафиксировано в ADR-0001.
- [x] **CP-WIN-01:** Windows-worker `0.1.2` подключён к coordinator на
  `clawvpn`; после отключения питания восстановил heartbeat и вернул `ready`
  через реальный `agent_start → agent_wait`.
- [x] **AOP-088:** Пройден `CP-WIN-01`, Windows-worker подключён.
- [x] **AOP-089:** Проверена связь двух Codex с разными аккаунтами.
- [x] **AOP-090:** Удалённый end-to-end тест Mac → VPS → Windows → VPS → Mac
  завершён успешно.
- [x] **AOP-050:** Реализован `git_file` attachment для `agent_start` и
  `agent_send`.
- [x] **AOP-051:** Worker проверяет repository, commit, path и SHA-256,
  выполняет fetch при необходимости и сохраняет working tree.
- [x] **AOP-103:** Добавлены bounded-поиск по локальной state DB и продолжение
  существующей задачи по точному `threadId`. Живые E2E на Mac и Windows
  завершились успешно; Windows-задача
  `019f9ff2-42a3-7c43-92e9-ab1b9794e043` вернула
  `WINDOWS_THREAD_ATTACH_OK`.
- [x] **AOP-070:** Опубликован реальный Windows Git-проект и выполнен
  `git_file` E2E Mac → Windows. Windows прочитал первую строку committed
  `README.md`; `HEAD` сохранился, `git status --porcelain` остался пустым.

### 2026-07-27

- [x] **AOP-052–AOP-056:** Coordinator и worker версии `0.1.7` реализуют
  временные вложения с привязкой к получателю, idempotency, TTL 24 часа,
  лимитом 10 MiB, quota 50 MiB и проверкой SHA-256.
- [x] **AOP-071:** Реальный E2E Mac → VPS → Windows передал текстовый файл в
  существующую задачу. Windows прочитал точное содержимое, после result
  метаданные и файл на coordinator были удалены.
- [x] **AOP-092:** Windows Scheduled Task запускает worker при входе
  пользователя, восстанавливает его после завершения и запрещает параллельные
  экземпляры. Отложенное переключение `0.1.6 → 0.1.7` восстановило heartbeat
  через обновлённую задачу.

## Definition of Done

Карточка завершена, когда:

- результат работает в целевом сценарии;
- добавлены необходимые тесты;
- typecheck, lint и tests проходят;
- измерена нагрузка для фоновых компонентов;
- документация и канбан обновлены.
