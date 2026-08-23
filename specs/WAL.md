# WAL

## Active Checkpoints

### WI-010 — clean-room acceptance и публикация

- Final source version: `0.2.0-alpha`; candidate base `c62378f`, последние
  pre-public gates готовятся в release PR.
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
- Далее: commit → exact CI/security → Windows manual gate → public visibility →
  annotated final tag → signed draft → full exact clean-room → evidence →
  publish workflow → anonymous clone/pull/download.

## Cross-work

Нет.

## Decisions Pending

Нет.
