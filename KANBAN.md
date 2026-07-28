# Канбан Agent Operator

> С 2026-07-28 оперативная работа ведётся в
> [`specs/BOARD.md`](specs/BOARD.md). Этот файл сохраняет историю разработки
> MVP и прежние номера AOP.

Обновлено: 2026-07-28

Цель MVP: два Codex с разными аккаунтами видят состояние друг друга,
выбирают локальный проект, запускают свежую работу, обмениваются сообщениями и
автоматически получают результат.

В колонке «В работе» находится одна основная инженерная карточка.

## В работе

Активной инженерной карточки нет.

## Ближайший порядок

1. Выбрать следующую карточку развития после подтверждения приоритета.

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
- [x] **AOP-074:** Подключить MCP и routing skill к обычным чатам Codex на
  обоих компьютерах.
- [x] **AOP-075:** Добавить управляемую отмену и lease активного turn, чтобы
  восстановленная зависшая работа не блокировала очередь бессрочно.
- [x] **AOP-076:** Расширить Desktop-owned delivery на `agent_start` и
  проверить локальный IPC-путь macOS.
- [x] **AOP-077:** Добавить локальное обнаружение доступных моделей и
  reasoning efforts, опциональные overrides в `agent_start`, `agent_send` и
  `agent_thread_send`, валидацию на принимающем worker и передачу параметров в
  Desktop-owned turn.
- [x] **AOP-078:** Выполнять follower handshake и загрузку полной истории,
  чтобы первый удалённый turn сразу отображался в новой карточке.

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
- [x] **AOP-084:** Настроить backup SQLite.
- [x] **AOP-085:** Настроить Caddy и HTTPS на свободных 80/443.
- [x] **AOP-086:** Установить worker на macOS.
- [x] **AOP-087:** Подготовить Windows package, диагностику и актуальный prompt.
- [x] **AOP-091:** Подготовить инструкцию эксплуатации.
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

### 2026-07-28

- [x] **AOP-073:** Worker `0.1.14` запускает новый turn в существующей
  Windows-задаче через Desktop follower IPC. Prompt, прогресс и финальный
  ответ появляются в открытом Desktop без перезапуска. Короткий, 48-секундный
  и параллельный E2E завершились одним result без дублей. Переходный
  `interrupted` read-only app-server больше не завершает работу преждевременно.
  Доказательства сохранены в `docs/E2E_WINDOWS_DESKTOP_0.1.14.md`.
- [x] **AOP-076:** Worker `0.1.15` создаёт пустую проектную задачу и передаёт
  её первый turn владельцу Codex Desktop через локальный IPC. Mac и Windows
  показали prompt и финальный ответ без перезапуска приложения. Windows E2E
  создал задачу `019fa656-f63a-7bb0-98f5-bae1b7691cfd` и вернул
  `WINDOWS_DESKTOP_START_015_OK`.
- [x] **AOP-075:** Coordinator и worker `0.1.16` используют двухчасовой lease,
  освобождают исторический backlog и поддерживают `agent_cancel`. Живой
  Windows E2E остановил активный Desktop-turn со статусом `cancelled` и вернул
  worker в `idle`.
- [x] **AOP-077:** `agent_models` получил семь локально доступных Windows
  моделей. Живой запуск принял `gpt-5.4-mini` с reasoning `high`.
- [x] **AOP-084:** На `clawvpn` включён ежедневный systemd timer, создан и
  проверен согласованный SQLite snapshot, срок хранения составляет семь дней.
- [x] **AOP-091:** Добавлен `docs/OPERATIONS.md` с диагностикой, перезапуском,
  backup/restore, обновлением и восстановлением очереди.
- [x] **AOP-074:** MCP `agent-operator` и skill `coordinate-agents`
  активированы в обычных чатах обоих Desktop. Projectless-чат Mac создал
  Windows-задачу `019fa851-e8ea-7ab1-a5e9-690d31cea6c2` и получил
  `WINDOWS_ORDINARY_MCP_OK_016`. Обычный Windows-чат создал Mac-задачу
  `019fa858-eb2d-7c93-8a8d-a1d1cd9005c3` и получил
  `MAC_ORDINARY_MCP_OK_016`. В каждой цепочке зафиксирован один start и один
  result; оба worker вернулись в `idle`, очередь пуста.
- [x] **AOP-078:** Worker `0.1.18` регистрируется через
  `thread-stream-following-changed` версии 1, ждёт snapshot owner и после
  терминального результата вызывает `thread-follower-load-complete-history`.
  Новые задачи `019fa88b-5a8b-7322-a4d9-df7ee60b909e` на Mac и
  `019fa894-ba96-7382-a955-6b3102dad9a8` на Windows сразу показали prompt и
  финальный ответ без перезапуска Desktop. Пользователь подтвердил обе
  карточки; доказательства сохранены в `docs/E2E_RELEASE_0.1.18.md`.

## Definition of Done

Карточка завершена, когда:

- результат работает в целевом сценарии;
- добавлены необходимые тесты;
- typecheck, lint и tests проходят;
- измерена нагрузка для фоновых компонентов;
- документация и канбан обновлены.
