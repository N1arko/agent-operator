# Agent Operator

[English version](README.md)

Agent Operator — бесплатный self-hosted канал координации Codex-агентов на
ваших компьютерах и аккаунтах. Небольшой coordinator передаёт presence,
сообщения, результаты задач и временные файлы. Локальный worker сохраняет
Codex-сессию и исходный код на своём компьютере.

> **Alpha:** публичная линия начинается с `v0.2.0-alpha`. Перед установкой
> прочитайте [матрицу совместимости](docs/getting-started/COMPATIBILITY.ru.md) и
> [известные ограничения](docs/getting-started/COMPATIBILITY.ru.md#известные-ограничения).

## Возможности

- список подключённых агентов и описаний проектов без локальных путей;
- новая Codex-задача в выбранном проекте другого компьютера;
- продолжение известной или найденной по заголовку Codex-задачи;
- последовательные follow-up, progress, отмена и итоговый результат;
- передача файлов через Git или ограниченное временное вложение;
- один управляемый владельцем trust domain с enrollment и revoke каждого
  устройства;
- install, diagnose, update, rollback и uninstall worker на macOS и Windows;
- backup и restore состояния coordinator.

```text
Codex + worker (macOS)  ──исходящий HTTPS──┐
                                           ├── self-hosted coordinator
Codex + worker (Windows) ─исходящий HTTPS──┘   SQLite + хранилище файлов
```

OpenAI credentials, исходный код, абсолютные пути проектов и полный список
локальных задач остаются на worker hosts. Подробности — в
[модели безопасности и приватности](docs/security/SECURITY-MODEL.ru.md).

## Быстрый старт

Понадобятся:

- Linux `amd64` или `arm64` host с Docker Compose;
- домен и открытые порты 80/443 либо частная сеть между всеми host;
- Node.js 24 и Codex на каждом macOS или Windows worker host;
- два устройства для первой сквозной задачи.

Откройте [Быстрый старт](docs/getting-started/QUICKSTART.ru.md). В нём есть:

1. скачивание и проверка release artifacts;
2. запуск coordinator с вашим URL;
3. создание одноразовых enrollment codes;
4. установка worker на macOS и Windows;
5. первая задача между компьютерами и получение результата.

## Документация

- [Навигация по документации](docs/README.ru.md)
- [Быстрый старт](docs/getting-started/QUICKSTART.ru.md)
- [Coordinator](docs/getting-started/COORDINATOR.ru.md)
- [Worker](docs/getting-started/WORKER.ru.md)
- [Архитектура](docs/ARCHITECTURE.ru.md)
- [Эксплуатация и восстановление](docs/OPERATIONS.ru.md)
- [Диагностика проблем](docs/operations/TROUBLESHOOTING.ru.md)
- [Политика безопасности](SECURITY.ru.md)
- [Участие в разработке](CONTRIBUTING.ru.md)

## Границы продукта

Alpha поддерживает одну доверенную группу устройств владельца. Один worker
исполняет один активный Codex turn и имеет ограниченную очередь. Hosted
multi-tenant, детальные роли, web-панель, расписания, магазины приложений,
нативная подпись пакетов и несколько одновременных turn одного worker входят в
будущие версии.

## Разработка

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm audit --prod --audit-level high
```

Проект использует исполняемые спецификации в [`specs/`](specs/README.md).
Вклад публикуется под [Apache License 2.0](LICENSE).
