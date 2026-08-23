---
status: active
---

# FEAT-007: Enrollment и управление устройствами {#root}

## Простыми словами {#plain-language}

Владелец coordinator создаёт короткоживущий одноразовый код. Новый worker
обменивает его на собственный credential, появляется в доверенном контуре и
может быть отозван владельцем.

## 1. Цель {#goal}

Заменить ручное редактирование общей token map самостоятельным, проверяемым и
отзываемым lifecycle устройств для self-hosted deployment.

## 2. Управляющие спеки {#governing-specs}

- `spec://common/PROP-007-OPEN-SOURCE#trust-domain`
- `spec://common/PROP-006-API#auth`
- `spec://common/PROP-001-DATA#entities`
- `spec://modules/coordinator/PROP-100-coordinator#scope.in`

## 3. Границы {#scope}

### 3.1. Входит {#scope.in}

- локальная operator CLI для create/list/revoke;
- одноразовый enrollment code;
- выдача отдельного device credential;
- hashed credential/enrollment storage;
- device identity, display name, status и audit metadata;
- немедленный отказ следующего запроса после revoke;
- migration path для `AOP_DEVICE_TOKENS`.

### 3.2. За границей {#scope.out}

- публичная account registration;
- email/OAuth login;
- несколько tenants и роли внутри deployment;
- удалённое восстановление потерянного credential;
- автоматическое удаление mailbox history после revoke;
- web admin UI.

## 4. Участники и trigger {#actors}

- Owner: имеет shell-доступ к coordinator deployment и запускает `aopctl`.
- Candidate worker: имеет coordinator URL и одноразовый code.
- Coordinator: проверяет code, создаёт device и выдаёт credential один раз.
- Registered device: использует credential для worker HTTP и MCP identity.

Enrollment начинается явной локальной командой owner. Публичный endpoint сам
не создаёт code и не перечисляет administrative secrets.

## 5. Состояния {#states}

### Enrollment code {#states.enrollment}

```text
issued → consumed
      ↘ expired
      ↘ revoked
```

- Code использует криптографически стойкую случайность и показывается один раз.
- В SQLite хранится hash и metadata, plaintext не хранится.
- Начальный TTL — 10 минут.
- Один code создаёт не более одного device.
- Code связывается с нормализованными `agentId` и `agentName`, заданными owner.

### Device {#states.device}

```text
active → revoked
```

- `agentId` уникален внутри trust domain и после revoke не переиспользуется
  автоматически.
- Display name можно менять отдельной operator command без смены identity.
- Revoked credential не проходит authentication.
- Re-enrollment того же физического host создаёт новый credential и явное
  operator-controlled identity decision.

## 6. Данные {#data}

Минимальные persistent records:

```text
enrollment_codes
  id, code_hash, agent_id, agent_name, expires_at, consumed_at, revoked_at,
  created_at

device_credentials
  id, agent_id, token_hash, token_hint, created_at, last_used_at, revoked_at
```

- Raw device token возвращается только в успешном enrollment response.
- `token_hint` содержит безопасный короткий suffix для operator diagnosis.
- Hashing использует server-side keyed digest или password-hash primitive,
  выбранный ADR перед реализацией.
- Audit не содержит raw code/token, prompt, result и локальные project paths.

## 7. Сценарии {#scenarios}

### Создать code {#scenarios.create}

Owner запускает:

```text
aopctl device create --id studio-mac --name "Studio Mac"
```

CLI проверяет уникальность identity, сохраняет hash, показывает coordinator URL,
code и expiry. Повтор команды создаёт новый независимый code.

### Подключить worker {#scenarios.enroll}

Installer отправляет code и свою platform/version metadata. Coordinator
атомарно проверяет unused/unexpired state, создаёт credential, помечает code
consumed и возвращает token один раз. Worker сохраняет token с правами owner
user и выполняет diagnose/heartbeat.

### Список устройств {#scenarios.list}

`aopctl device list` показывает agent ID, display name, credential hint,
active/revoked, worker version, last seen и enrollment date. Команда выполняется
локально в operator context.

### Отозвать устройство {#scenarios.revoke}

`aopctl device revoke AGENT_ID` требует точный ID. Coordinator отмечает все
active credentials identity как revoked. Следующий HTTP/MCP request получает
`401 device_revoked`; long poll завершается не позднее следующего request
boundary. Outstanding messages сохраняются для operator diagnosis.

### Legacy migration {#scenarios.legacy}

- `AOP_DEVICE_TOKENS` продолжает работать в `v0.2.0-alpha` как migration-only
  credential source.
- `aopctl device list` помечает такие identity как `legacy` без token hint.
- Owner создаёт replacement enrollment, обновляет worker и удаляет legacy token
  из environment отдельным rollout.
- Public Quick Start не использует legacy token map.
- Дата удаления compatibility path объявляется в будущих release notes.

## 8. API и CLI контракты {#contracts}

### Public enrollment endpoint {#contracts.enroll}

```text
POST /v1/enrollment/consume
```

Request содержит code и bounded platform/version metadata. Success возвращает
`agentId`, `agentName`, `deviceToken` и coordinator compatibility metadata.
Endpoint имеет строгий body limit, rate limit и одинаковую внешнюю форму для
unknown/expired/consumed code.

### Operator CLI {#contracts.cli}

```text
aopctl device create --id AGENT_ID --name "Device name"
aopctl device list [--json]
aopctl device revoke AGENT_ID
aopctl enrollment revoke CODE_ID
```

CLI работает с тем же persistent data directory через локальный process/container
boundary. Public remote admin API в alpha отсутствует.

## 9. Ошибки и защита {#errors}

- invalid agent ID/name → validation error без записи;
- duplicate active/reserved agent ID → conflict;
- unknown, expired, consumed или revoked code → generic enrollment denied;
- reused code при concurrent requests → один success, остальные denied;
- revoked token → `401 device_revoked`;
- incompatible worker → enrollment сохраняется только при явно поддерживаемом
  migration path, иначе запрос отклоняется до credential creation;
- storage failure → транзакция не выдаёт credential и не consumes code;
- repeated failures → per-IP и global bounded rate limits, audit counter без
  plaintext code.

## 10. Трассировка реализации {#traceability}

Ожидаемые точки `@spec`:

- schema migration и store methods;
- authentication resolver;
- enrollment HTTP handler;
- `aopctl` device/enrollment commands;
- worker installer credential persistence;
- concurrency, revoke и migration tests.

## 11. Критерии готовности {#acceptance}

- Fresh owner создаёт code без ручного редактирования `.env`.
- Два конкурентных consume получают ровно один credential.
- Raw code/token отсутствуют в SQLite, logs и audit output.
- Enrolled worker выполняет heartbeat и MCP access своей identity.
- Revoke блокирует HTTP и MCP на следующей границе request.
- Legacy production credentials продолжают работать до управляемой миграции.
- Create/list/revoke проходят restart coordinator и backup/restore.
- Invalid/expired/replayed input покрыт contract/security tests.
- Clean-room Mac и Windows onboarding используют один documented contract.

## 12. Связи {#relationships}

- `spec://common/PROP-007-OPEN-SOURCE#trust-domain`
- `spec://modules/coordinator/FEAT-001-agent-discovery#root`
- `spec://modules/coordinator/INFRA-001-coordinator-runtime#data`
- `spec://modules/worker/INFRA-003-release-and-recovery#rollout`

## 13. История изменений {#changelog}

- [2026-08-23] Реализован и принят `WI-005`: HMAC storage, atomic consume,
  `aopctl`, persistent/legacy auth, revoke и contract/security tests.
- [2026-08-23] Принят enrollment/revoke contract для self-hosted
  `v0.2.0-alpha` с migration path legacy token map.
