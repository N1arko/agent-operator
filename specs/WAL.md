# WAL

## Active Checkpoints

### WI-010 — clean-room acceptance и публикация

- Final source version: `0.2.0-alpha`; текущая работа ведётся в
  `codex/wi010-release-evidence` от merge revision
  `b5c2298f3eeb65d07daca4974f9034317fe5c641`.
- OpenAI Desktop `26.818.41509` / Codex `0.149.0-alpha.4.1` изменил follower
  start contract. Старый v1 request не находил обработчика, worker переходил в
  headless fallback, а карточка оставалась пустой до финала.
- Исправление освобождает app-server writer после создания thread, отправляет
  `thread-follower-start-turn` v2 с `turnStart` envelope и ждёт принятие до
  60 секунд. Живой macOS turn показал prompt, commentary и command progress во
  время выполнения, затем вернул terminal result через read-only observer.
- Исправление принято PR `#6`. Exact main CI run `32671718959` прошёл quality,
  worker artifacts и macOS/Windows smoke; Security run `32671718973` прошёл
  production dependency и repository secret gates.
- Private `v0.2.0-alpha.0` rehearsal прошла checksum, isolated coordinator,
  macOS install/doctor, enrollment, backup/restore, restart/reconnect, task,
  follow-up, cancel и temporary file.
- Rehearsal выявила и закрывает два release blockers: TLS allowlist сохраняет
  loopback-hosts для healthcheck; Windows PATH launcher `codex` исполняется
  через системный command processor.
- Exact CI Windows artifact с checksum
  `7f8280a09df7a75cc7530e806318118e8c7020359e3eadffc133a080fbb54a49`
  доставлен на реальный host; manifest подтверждает version
  `0.2.0-alpha`, platform `windows` и revision `b5c2298`. Изолированный
  coordinator после backup обновлён до той же revision и имеет healthy public
  endpoint. Enrollment и one-command launcher подготовлены локально на
  Windows.
- Политика sandbox удалённой Codex-сессии запрещает outbound worker connection,
  а Computer Use запрещает автоматизировать terminal UI. Нужен один ручной
  PowerShell запуск подготовленного launcher, затем Windows live-view turn.
- Далее: Windows manual live-view gate → evidence merge → public visibility →
  annotated final tag → signed draft → full exact clean-room → evidence →
  publish workflow → anonymous clone/pull/download.

## Cross-work

Нет.

## Decisions Pending

Нет.
