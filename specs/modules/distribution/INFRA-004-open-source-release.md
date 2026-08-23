---
status: active
---

# INFRA-004: Open-source release и supply chain {#root}

## Простыми словами {#plain-language}

Release pipeline проверяет один Git tag, собирает coordinator и worker packages,
публикует их с checksums и доказательствами происхождения, затем запускает
clean-room приёмку по тем же artifacts.

## 1. Цель {#goal}

Сделать выпуск `v0.2.0-alpha` воспроизводимым, безопасным и проверяемым от
source revision до установки новым пользователем.

## 2. Управляющие спеки {#governing-specs}

- `spec://modules/distribution/PROP-102-distribution#rules`
- `spec://common/PROP-007-OPEN-SOURCE#deliverables`
- `spec://common/PROP-000-workflow#quality`
- `spec://common/PROP-002-STACK#deploy`

## 3. Границы {#scope}

### 3.1. Входит {#scope.in}

- CI для pull request и main;
- release workflow для annotated `v*` tag;
- GHCR multi-architecture coordinator image;
- platform worker packages;
- deterministic manifests, checksums, SBOM и provenance;
- dependency/license/secret/history gates;
- draft release, clean-room acceptance и финальная публикация;
- generic deployment and installer artifact contracts.

### 3.2. За границей {#scope.out}

- production deployment пользователя;
- hosted control plane;
- native package signing/notarization;
- automatic background self-update;
- long-term support policy beyond alpha compatibility window.

## 4. Окружения и зависимости {#environments}

### CI {#environments.ci}

- GitHub-hosted Linux для lint, tests, security и coordinator images;
- GitHub-hosted macOS для macOS package/install smoke;
- GitHub-hosted Windows для Windows package/install smoke;
- Node/pnpm versions pin-ятся через repository files и lockfile;
- container bases pin-ятся release-controlled version/digest policy.

### Clean-room {#environments.clean-room}

- fresh Linux Docker host с новым data directory;
- fresh supported macOS user profile;
- fresh supported Windows user profile;
- два независимых Codex accounts;
- опубликованные release URLs/digests, без local checkout artifacts.

Точная support matrix публикуется после observed acceptance и входит в release
metadata.

## 5. Канонические решения {#decisions}

- `package.json` является единственным source release version до введения
  отдельного version manifest.
- Tag version, package version, health, MCP/server info, image labels и artifact
  names проверяются на равенство автоматически.
- Pull request CI не получает release credentials.
- Release создаётся draft после build; public state устанавливается после
  security и clean-room gates.
- На GitHub Free приватный release candidate сохраняет BuildKit provenance и
  явно помеченные unsigned workflow provenance statements. GitHub-signed
  attestations обязательны для финального tag после открытия repository;
  private candidate не считается финальным supply-chain evidence.
- Build artifacts передаются между jobs по digest, затем публикуются без
  повторной локальной сборки.
- Existing `v0.1.23` остаётся historical baseline; публичная линия начинается с
  `v0.2.0-alpha`.

## 6. CI pipeline {#ci}

Каждый pull request и main revision выполняет:

1. frozen dependency install;
2. typecheck, lint и spec lint;
3. unit, contract и vertical tests;
4. package smoke tests на заявленных OS;
5. production dependency audit с zero high/critical gate;
6. secret scan текущего tree;
7. dependency license inventory;
8. container build без публикации;
9. verification summary, связанный с commit SHA.

Security scanners используют pinned actions и минимальные permissions.

## 7. Artifact contracts {#artifacts}

### Source {#artifacts.source}

- annotated Git tag, например `v0.2.0-alpha.1`;
- automatically generated source archives GitHub;
- release notes с compatibility, migration и known limitations.

### Coordinator {#artifacts.coordinator}

- `ghcr.io/OWNER/agent-operator:{version}`;
- platforms `linux/amd64` и `linux/arm64` после platform smoke;
- OCI labels: source, revision, version, license, created;
- digest pin для Quick Start/verification.

### Worker {#artifacts.worker}

- `agent-operator-worker-macos-{version}.tar.gz`;
- `agent-operator-worker-windows-{version}.zip`;
- package содержит compiled worker, platform scripts, skill, version manifest и
  public setup instructions;
- dependencies устанавливаются frozen способом либо входят в package с
  документированной license inventory;
- package не содержит coordinator source, test fixtures, personal config и
  release history другого platform.

### Verification {#artifacts.verification}

- `SHA256SUMS` для downloadable files;
- SPDX или CycloneDX SBOM для image и worker packages;
- GitHub artifact attestation/provenance для image и packages;
- JSON release receipt: tag, commit, image digests, package hashes, checks и
  clean-room evidence links.

## 8. Generic coordinator deployment {#deployment}

Public compose bundle:

- принимает `AOP_PUBLIC_URL`/domain из `.env`;
- создаёт persistent data directory с ожидаемыми ownership/permissions;
- запускает version-pinned coordinator image и Caddy profile;
- имеет healthcheck, resource defaults и restart policy;
- поддерживает documented direct TLS и private-network variants;
- включает `aopctl` для enrollment, diagnose, backup и restore;
- не содержит `clawvpn`, sslip hostname, `mac/windows` identity и personal path.

## 9. Worker package lifecycle {#worker-lifecycle}

Installer:

1. проверяет platform, Node и Codex compatibility;
2. принимает coordinator URL и one-time enrollment code;
3. сохраняет credential с user-only permissions;
4. настраивает projects, service, MCP и skill;
5. выполняет doctor и первый heartbeat;
6. выводит следующий documented control scenario.

Update сохраняет durable state и config, проверяет package checksum, выполняет
diagnose до cutover и сохраняет предыдущую version directory для rollback.
Uninstall останавливает service, удаляет integration/config по явному scope и
предлагает сохранить либо удалить local state.

## 10. Security и история {#security}

До изменения repository visibility:

- current tree и полная Git history проходят secret scan;
- personal hostnames/IP/paths/identities классифицируются и удаляются из
  public product surface либо явно сохраняются как безопасная история;
- dependency graph не содержит high/critical production advisories;
- third-party license inventory совместима с выбранным distribution;
- `SECURITY.md` и private report channel доступны;
- build/release workflows имеют explicit minimal permissions;
- release artifacts не содержат tokens, `.env`, logs, state DB и prompts.

History rewrite выполняется только по отдельному destructive plan после
read-only inventory и явного подтверждения точных targets.

## 11. Rollout, rollback и публикация {#release}

1. Merge exact release candidate в main.
2. Создать annotated version tag.
3. CI строит draft artifacts и verification receipt.
4. Выполнить package install smoke на macOS/Windows.
5. Выполнить clean-room scenario по draft artifacts.
6. Зафиксировать evidence, zero blocking findings и immutable digests.
7. Сделать repository public и создать финальный annotated tag.
8. Получить GitHub-signed attestations, повторить короткий smoke и опубликовать
   release.
9. Проверить anonymous clone, GHCR pull, downloads и Quick Start links.

При провале gate draft release удаляется или остаётся private; tag исправляется
новой pre-release version, опубликованный artifact не перезаписывается.

## 12. Наблюдаемость {#observability}

- CI summary показывает каждый gate и commit SHA.
- Release receipt доступен вместе с artifacts.
- Image `/health` сообщает version и revision.
- `doctor --json` сообщает versions, connectivity и compatibility без secrets.
- Clean-room evidence указывает время, platform и exact digest.

## 13. Трассировка реализации {#traceability}

Ожидаемые `@spec`:

- CI/release workflow entrypoints;
- deterministic packaging/version verification helpers;
- Dockerfile/compose public profiles;
- installer/update/uninstall entrypoints;
- SBOM/provenance/receipt generation;
- clean-room acceptance scripts.

## 14. Критерии готовности {#acceptance}

- Fork PR выполняет CI без доступа к release secrets.
- Tag mismatch с package/version немедленно отклоняется.
- Fresh checkout воспроизводит packages и manifests.
- Coordinator image запускается на заявленных architectures.
- macOS/Windows packages проходят install/doctor/update/rollback/uninstall.
- `SHA256SUMS`, SBOM, provenance и receipt согласованы с tag SHA.
- Security/history/license gates не имеют blocking findings.
- Clean-room двусторонний сценарий проходит на опубликованных digests.
- Anonymous user может clone/pull/download и выполнить Quick Start.

## 15. Связи {#relationships}

- `spec://common/PROP-007-OPEN-SOURCE#acceptance`
- `spec://modules/coordinator/FEAT-007-device-enrollment#contracts`
- `spec://modules/coordinator/INFRA-001-coordinator-runtime#rollout`
- `spec://modules/worker/INFRA-003-release-and-recovery#acceptance`

## 16. История изменений {#changelog}

- [2026-08-23] Принят supply-chain и clean-room release contract для
  `v0.2.0-alpha`.
