# WI-001: Обновить spec-driven workflow

- Kind: `migration`
- Canon action: `direct-edit`

## Outcome

Agent Operator использует актуальную forward-only модель с `SPEC-MAP`, независимыми `WI-NNN`, компактным `BOARD` и checkpoint-only `WAL`, сохраняя действующий продуктовый канон и legacy-историю.

## Specs

- Governing: `spec://common/PROP-000-workflow#workflow`
- Affected: `spec://common/PROP-000-workflow#quality`

## Scope

- In: актуальные generic protocols из указанного пользователем канона, `SPEC-MAP`, каталог work items, root-инструкции, forward-only миграция BOARD/WAL, проверка workflow-инвариантов.
- Out: изменение продуктового поведения Agent Operator, переписывание legacy-спек, принятие или публикация релиза `v0.2.0-alpha`.
- Preserve: `specs/.me`, существующие spec IDs и anchors, Done-история, продуктовые документы, текущие незакоммиченные изменения `0.1.23`.

## Acceptance

- [x] Актуальные protocol-файлы совпадают с каноническим источником.
- [x] `SPEC-MAP.md` регистрирует весь существующий рабочий канон и open-source waves.
- [x] Каждая новая строка BOARD ведёт на отдельный WI; legacy Done сохранён.
- [x] WAL использует checkpoint-only структуру и остаётся пустым до реального handoff.
- [x] `specs/.me` сохранён и игнорируется Git.
- [x] Продуктовые спеки и изменения `0.1.23` не перезаписаны шаблоном.
- [x] Spec lint, typecheck, lint и tests проходят после миграции.

## Result

Актуальный workflow принят forward-only: generic protocols перенесены из
канонического источника с нормализацией CRLF в LF, создан `SPEC-MAP`, введены
независимые WI и checkpoint-only WAL, root-инструкции и `PROP-000` обновлены.
Legacy Done, продуктовые спеки, `specs/.me` и изменения `0.1.23` сохранены.

Проверки 2026-08-23 на текущем worktree:

- semantic diff семи protocol-файлов с источником: exact;
- `pnpm typecheck`: passed;
- `pnpm lint`: passed, `18` specs / `18` unique spec IDs / `1` unique WI ID;
- `pnpm test`: `45/45` passed;
- `git diff --check`: passed;
- `specs/.me`: preserved and Git-ignored.
