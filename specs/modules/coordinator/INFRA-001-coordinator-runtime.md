# INFRA-001: Production coordinator {#root}

## Простыми словами {#plain-language}

Coordinator постоянно работает на выбранном владельцем Docker host, принимает
HTTPS либо private-network запросы, хранит SQLite и временные файлы и создаёт
проверяемые backup bundles.

## 1. Цель {#goal}

Обеспечить воспроизводимый production runtime mailbox/presence-сервиса с
healthcheck, сохранением данных, rollback и восстановлением.

## 2. Управляющие спеки {#governing-specs}

- `spec://common/PROP-002-STACK#environments`
- `spec://common/PROP-001-DATA#migrations`
- `spec://common/PROP-005-RUNTIME#recovery`
- `spec://modules/coordinator/PROP-100-coordinator#scope.in`

## 3. Окружение {#environment}

- Host: Linux Docker host на заявленной release support matrix.
- Runtime: version-pinned coordinator image и Docker Compose.
- Edge: optional Caddy profile с automatic HTTPS либо operator-controlled
  private network/reverse proxy.
- State: bind-mounted data directory с SQLite, credential key, temporary files
  и backup bundles.
- Operator: локальный `aopctl` через one-shot container того же image.

Конкретный hostname, domain, public IP, device identities и absolute paths
принадлежат deployment владельца и отсутствуют в generic templates.

## 4. Канонические решения {#decisions}

- Host выполняет только coordination и хранение небольших временных файлов.
- SQLite соответствует текущей нагрузке и простому recovery.
- Локальный disk соответствует текущим quota и TTL.
- Новое хранилище добавляется после измеренной потребности.

## 5. Runtime и операции {#runtime}

Base Compose запускает coordinator на явно заданном bind address. TLS overlay
добавляет Caddy. `/health` сообщает status, version и source revision. Cleanup
expired files выполняется на heartbeat и файловых операциях. `aopctl` создаёт
enrollment, проверяет runtime и управляет backup/restore.

## 6. Данные и миграции {#data}

Data directory переживает container replacement. Startup выполняет совместимые
schema additions. Credential key хранится с owner-only permissions. Backup
связывает согласованный SQLite snapshot, credential key, checksums и manifest.
Restore требует остановленного coordinator, проверяет integrity/checksums,
сохраняет pre-restore bundle и атомарно заменяет state.

## 7. Контракты {#contracts}

- Operator-selected HTTPS либо private-network endpoint.
- `GET /health`.
- Compose service и volume contract.
- `aopctl device`, `doctor` и `backup` commands.
- Операторские команды из public self-hosted documentation.

## 8. Rollout и восстановление {#rollout}

1. Проверить Compose config, data permissions и свободные ресурсы.
2. Создать проверенный backup bundle.
3. Получить immutable image digest и запустить новую версию.
4. Проверить health, MCP и heartbeat обоих worker.
5. При сбое вернуть предыдущий image и pre-rollout backup bundle.
6. После restore выполнить вертикальный запрос.

## 9. Наблюдаемость {#observability}

Health version/revision, container state/logs, backup manifest/integrity,
heartbeat и queue state. Personal production evidence остаётся historical и не
задаёт generic deployment values.

## 10. Трассировка реализации {#traceability}

- `deploy/self-hosted/**`
- `src/coordinator/main.ts`, `src/coordinator/server.ts`
- public self-hosted operations documentation

## 11. Критерии готовности {#acceptance}

- Fresh Docker host запускает coordinator без изменения source files.
- Health доступен в выбранном HTTPS/private-network profile.
- SQLite, credential key и temporary directory persistent.
- Backup bundle проходит checksums и SQLite integrity; restore возвращает
  devices, queue и schema.
- Enrollment, restart и rollback выполняются documented operator commands.

## 12. Связи {#relations}

Поддерживает FEAT-001, FEAT-002 и FEAT-004.

## 13. История изменений {#changelog}

- [2026-08-23] Runtime канон переведён с personal VPS profile на generic
  self-hosted deployment с versioned image, `aopctl` и manifest backup.
- [2026-07-28] Сведены AOP-080–085 и AOP-091.
