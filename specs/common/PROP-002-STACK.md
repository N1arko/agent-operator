# PROP-002: Стек, сервисы и окружения {#root}

## Простыми словами {#plain-language}

Coordinator работает в контейнере на VPS. Worker запускается фоном на Mac и
Windows. Оба написаны на TypeScript и Node.js, общаются по HTTPS.

## 1. Назначение {#goal}

Зафиксировать технологический контур, среды запуска, проверку готовности,
доставку и наблюдаемость.

## 2. Сервисы {#services}

| Сервис | Технология | Назначение | Зависимости |
| --- | --- | --- | --- |
| coordinator | Node.js 24, Express, MCP SDK, SQLite | mailbox, presence, MCP и worker API | Caddy, локальный disk |
| worker | Node.js 24, Codex app-server | локальное выполнение и публикация результата | Codex CLI/Desktop, Git |
| routing skill | Markdown skill + MCP | выбор Agent Operator в обычном чате | локальная конфигурация Codex |

Общие схемы валидируются Zod. Проект собирается TypeScript 5.9 и использует
pnpm.

## 3. Окружения {#environments}

- Development: локальные процессы, временная SQLite и тестовые identities.
- Production coordinator: Docker Compose на SSH-host `clawvpn`, Caddy TLS,
  persistent data directory и systemd backup timer.
- macOS worker: LaunchAgent в пользовательской сессии.
- Windows worker: Scheduled Task в пользовательской сессии.

Worker создаёт только исходящие HTTPS-соединения. Desktop delivery требует
запущенную пользовательскую сессию Codex Desktop; базовый worker и очередь
доступны после входа пользователя без ручного запуска приложения.

## 4. Деплой и восстановление {#deploy}

- Coordinator собирается Dockerfile и выкладывается рядом с существующими
  сервисами через Compose.
- Перед изменением production базы создаётся SQLite snapshot.
- Health endpoint и версии обоих worker проверяются после rollout.
- Windows bundle имеет SHA-256 и сохраняет предыдущую версию для отката.
- Подробный порядок находится в `docs/OPERATIONS.md`.

## 5. Наблюдаемость {#observability}

Готовность подтверждают `/health`, последовательные heartbeat, состояние
agent, длина очереди, stdout/stderr worker и результаты E2E. Логи не должны
содержать содержимое рабочих каталогов. Инцидентные доказательства сохраняются
в `docs/E2E_*.md` или отдельном отчёте.

## 6. История изменений {#changelog}

- [2026-07-28] Зафиксирован production-контур версии 0.1.18.
