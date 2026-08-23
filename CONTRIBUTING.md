# Contributing to Agent Operator

[Русская версия](CONTRIBUTING.ru.md)

Thank you for helping improve Agent Operator.

## Before starting

- Read `AGENTS.md` and `specs/protocols/BOOT.md`.
- Use `specs/SPEC-MAP.md` to find the governing specification.
- Open an issue before a large behavior, protocol or architecture change.
- Keep one observable outcome per work item.

Small fixes to behavior already covered by an active specification can be sent
directly with a focused regression test. New capabilities and multi-step
changes need a `WI-NNN` under `specs/work/` and one BOARD row.

## Development setup

Requirements:

- Node.js 24 or newer;
- pnpm version declared in `package.json`;
- Git.

Install and verify:

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

- Explain the user-visible or runtime outcome.
- Link the governing spec and work item when one exists.
- Add tests proportional to the changed risk.
- Add full `@spec spec://...#anchor` markers at new responsibility points.
- Keep credentials, private prompts, local paths and generated state out of the
  repository.
- Update documentation in Russian and English when the release-critical user
  path changes.

By contributing, you agree that your contribution is licensed under the
Apache License 2.0.
