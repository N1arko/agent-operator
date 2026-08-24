# WAL

## Active Checkpoints

### WI-010 — clean-room acceptance и публикация

- Final source version: `0.2.0-alpha`; PR `#7` с Windows runner и evidence
  принят в `main`. Каждое дальнейшее pre-tag изменение требует нового exact CI
  artifact set.
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
  endpoint.
- Первый автономный one-shot запуск через Windows Task Scheduler дошёл до
  clean-room runner и завершился до install/receipt. Минимальный probe
  подтвердил: Windows PowerShell `5.1.26100.9168` отклоняет
  `-Encoding utf8NoBOM` с `ParameterBindingException`, PowerShell `7.6.3`
  принимает его. Portable .NET UTF-8 writer устраняет зависимость runner от
  PowerShell 7; полный regression прогон остаётся 68/68.
- Exact Windows worker установлен через совместимый runner и официальный Codex
  CLI `0.149.0`. Предустановленный внешний CLI `0.114.0` отклонял актуальный
  `config.toml`; current CLI прошёл model discovery, heartbeat и live turns.
- Windows observer открыл целевой Codex task во время выполнения и подтвердил
  prompt, commentary `WINDOWS_APP_DISAMBIGUATION_RUNNING_OK`, active work и
  отсутствие writer conflict. Initial turn и два follow-up завершились
  ожидаемыми terminal markers; Desktop rejection, headless fallback, IPC error
  и acceptance timeout в worker log отсутствуют.
- Merge revision `d4111ff47d3f0a7c51b3a83527cf1df492e6f7b2` прошла main CI
  `32674355544` и Security `32674355545`. Exact Windows CI package SHA256
  `5969170d1d77b9f339cb38df597f45f72b1982438b7deb81fd3e49281a1dec60`
  установлен отдельным clean-room worker на Windows PowerShell 5.1 / Codex CLI
  `0.149.0`; coordinator той же revision, heartbeat, prompt, running commentary,
  active work, terminal result и отсутствие writer conflict подтверждены.
- Финальный read-only audit подтвердил zero secret findings на полной истории и
  отсутствие private deployment references в текущей публичной документации.
  Исторические deployment references классифицированы WI-004;
  `historyRewriteRequired=false`. Exact tag workflow повторит history scan.
- Final source/tag `v0.2.0-alpha` закреплён на
  `4bc845d6b7b1e0c203427806d43a605f116cc7c7`; exact main CI и Security прошли.
  Repository открыт, anonymous clone подтверждён. Signed draft release прошёл
  checksums, SBOM, provenance, Trivy и multi-arch image gates.
- GHCR package открыт после явного подтверждения человека; anonymous manifest
  exact digest `sha256:57e8fc51...` подтвердил `linux/amd64` и `linux/arm64`.
- Exact Windows ZIP с SHA256
  `87cda9926345d608b6f0dd1bd06757432633e70b6215b3f979ca644f955c7227`
  передан старому isolated worker, сохранён отдельно и проверен по manifest:
  version `0.2.0-alpha`, platform `windows`, revision `4bc845d6...`; установка
  не выполнялась. Fresh coordinator, macOS worker и Windows worker затем
  подняты из exact artifacts `4bc845d6...`; enrollment, doctor, heartbeat,
  isolated MCP/skill integration и Codex `0.149.0` подтверждены.
- Windows clean-room выявил два release-blocker: custom `CodexHome` не попадал
  в environment Codex subprocess, а `NoService` update/rollback/uninstall мог
  затронуть глобальную Scheduled Task. Production Windows task был точечно
  перезапущен через сохранённый isolated worker, heartbeat восстановлен; config
  и данные production не менялись.
- Исправление `2ee7193` передаёт и сохраняет exact Codex home, фиксирует
  service ownership для NoService-профиля и покрывает оба случая regression
  tests. Локально прошли typecheck, lint, spec/docs checks и 68/68 tests.
- Fix принят в `main` revision
  `868839154632e9968aee70f99adb4aa811f7002f`; exact main CI
  `32678428361` и Security `32678428324` прошли. Пересозданный tag workflow
  `32678565769` выявил runner-level ARM64 blocker: QEMU завершался с
  `Illegal instruction` во время `pnpm install` и оставлял BuildKit job
  зависшим до отмены.
- Docker build stage переведён на native `BUILDPLATFORM`; coordinator runtime
  не содержит native Node addons. Локально на `linux/arm64` успешно собраны и
  запущены native arm64 и cross-built amd64 images; typecheck, lint/docs/spec
  checks и 68/68 tests прошли.
- Далее: принять multi-arch build fix в main → снова заменить unpublished
  final tag/draft/GHCR exact artifact set → повторить fresh clean-room matrix →
  public-safe evidence → publish workflow → anonymous Quick Start audit.

## Cross-work

Нет.

## Decisions Pending

Нет.
