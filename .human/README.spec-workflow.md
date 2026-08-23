## Spec-driven workflow

Проект ведётся через общий канон и независимые единицы реализации в `specs/`.

- `specs/SPEC-MAP.md` показывает существующие спеки, их ответственность и lifecycle.
- `specs/common/` и `specs/modules/` хранят `PROP`, `FEAT` и `INFRA`.
- `specs/work/WI-NNN-*.md` хранит outcome, scope и acceptance конкретной работы.
- `specs/BOARD.md` показывает статус WI.
- `specs/WAL.md` хранит checkpoints незавершённой работы.
- Новый или существенно изменённый spec-owned код получает `@spec spec://...#...`.

AI начинает с `AGENTS.md` и `specs/protocols/BOOT.md`.
