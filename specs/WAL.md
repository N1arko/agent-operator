# WAL

## Active Checkpoints

### WI-010 — clean-room acceptance и публикация

- Final source version: `0.2.0-alpha`; текущая работа ведётся в
  `codex/wi010-live-view-fix` от `9cd06e2`.
- OpenAI Desktop `26.818.41509` / Codex `0.149.0-alpha.4.1` изменил follower
  start contract. Старый v1 request не находил обработчика, worker переходил в
  headless fallback, а карточка оставалась пустой до финала.
- Исправление освобождает app-server writer после создания thread, отправляет
  `thread-follower-start-turn` v2 с `turnStart` envelope и ждёт принятие до
  60 секунд. Живой macOS turn показал prompt, commentary и command progress во
  время выполнения, затем вернул terminal result через read-only observer.
- Private `v0.2.0-alpha.0` rehearsal прошла checksum, isolated coordinator,
  macOS install/doctor, enrollment, backup/restore, restart/reconnect, task,
  follow-up, cancel и temporary file.
- Rehearsal выявила и закрывает два release blockers: TLS allowlist сохраняет
  loopback-hosts для healthcheck; Windows PATH launcher `codex` исполняется
  через системный command processor.
- Windows artifact checksum/manifest/Codex compatibility проверены на реальном
  host. Enrollment и live worker blocked политикой sandbox удалённой Codex
  сессии, запрещающей outbound network. Нужен один manual PowerShell запуск
  exact final package на этом host после появления draft assets.
- Далее: commit → exact CI/security → пересборка exact packages → Windows
  manual live-view gate → public visibility →
  annotated final tag → signed draft → full exact clean-room → evidence →
  publish workflow → anonymous clone/pull/download.

## Cross-work

Нет.

## Decisions Pending

Нет.
