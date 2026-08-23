# ROADMAP

Канонические спеки, waves и устойчивые зависимости находятся в
[`SPEC-MAP.md`](SPEC-MAP.md). Оперативное состояние и последовательность WI
хранятся в [`BOARD.md`](BOARD.md); outcome и acceptance каждой работы — в
`specs/work/`.

## Завершённый фундамент

- Presence и mailbox между независимыми Codex.
- Выбор локального проекта и существующей задачи.
- Последовательное удалённое выполнение с ожиданием и отменой.
- Видимый prompt, прогресс и ответ в Codex Desktop на macOS и Windows.
- Git-файлы и небольшие временные вложения.
- Production coordinator, автозапуск worker, backup и recovery.

## Текущая волна: open-source v0.2

- Self-hosted trust domain: `PROP-007`.
- Enrollment и revoke устройств: `FEAT-007`.
- Distribution и supply chain: `PROP-102`, `INFRA-004`.
- Реализация: `WI-004`–`WI-010` в порядке зависимостей BOARD.

Волна завершается public repository и `v0.2.0-alpha` после security и
clean-room gates exact artifacts.

## Кандидаты следующих волн

- Уведомления о завершении и запросе внимания.
- Пользовательский интерфейс состояния агентов и очереди.
- Несколько одновременных turn на одном мощном host.
- Управляемая оркестрация нескольких агентов.
- Расписания и периодические задания.
- Нативная подписанная упаковка и automatic update worker.
- Hosted multi-tenant и многопользовательские права.

Приоритет следующей волны выбирает пользователь. После выбора создаётся или
изменяется governing spec и отдельные `WI-NNN`.
