# Участие в разработке Agent Operator

[English version](CONTRIBUTING.md)

Спасибо за помощь Agent Operator.

## Перед началом

- Прочитайте `AGENTS.md` и `specs/protocols/BOOT.md`.
- Найдите governing specification через `specs/SPEC-MAP.md`.
- До крупного изменения behavior, protocol или architecture откройте issue.
- Один work item должен иметь один наблюдаемый outcome.

Небольшое исправление поведения, уже описанного active specification, может
прийти с focused regression test. Новая capability и многошаговое изменение
получают `WI-NNN` в `specs/work/` и одну строку BOARD.

## Development setup

Требования:

- Node.js 24 или новее;
- версия pnpm из `package.json`;
- Git.

Установка и проверка:

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm audit --prod
pnpm docs:check
```

## Pull requests

- Опишите user-visible или runtime outcome.
- Добавьте governing spec и work item, когда они существуют.
- Добавьте tests пропорционально риску изменения.
- Разместите полный `@spec spec://...#anchor` в новых responsibility points.
- Исключите credentials, private prompts, local paths и generated state.
- Обновите русскую и английскую документацию при изменении release-critical
  user path.

Вклад публикуется под Apache License 2.0.
