# INFRA-001: Production coordinator {#root}

## Простыми словами {#plain-language}

Coordinator постоянно работает на VPS `clawvpn`, принимает HTTPS-запросы,
хранит SQLite и временные файлы, ежедневно создаёт проверяемый backup.

## 1. Цель {#goal}

Обеспечить воспроизводимый production runtime mailbox/presence-сервиса с
healthcheck, сохранением данных, rollback и восстановлением.

## 2. Управляющие спеки {#governing-specs}

- `spec://common/PROP-002-STACK#environments`
- `spec://common/PROP-001-DATA#migrations`
- `spec://common/PROP-005-RUNTIME#recovery`
- `spec://modules/coordinator/PROP-100-coordinator#scope.in`

## 3. Окружение {#environment}

- Host: SSH alias `clawvpn`.
- Runtime: Docker Compose, Node.js coordinator image.
- Edge: Caddy с доверенным HTTPS.
- State: persistent data directory с SQLite и temporary files.
- Backup: systemd service/timer, согласованный SQLite snapshot, retention семь
  дней.

Существующие сервисы VPS сохраняют свои порты и volumes.

## 4. Канонические решения {#decisions}

- VPS выполняет только coordination и хранение небольших временных файлов.
- SQLite соответствует текущей нагрузке и простому recovery.
- Локальный disk соответствует текущим quota и TTL.
- Новое хранилище добавляется после измеренной потребности.

## 5. Runtime и операции {#runtime}

Compose запускает coordinator и Caddy. `/health` сообщает status и version.
Cleanup expired files выполняется на heartbeat и файловых операциях. Backup
timer работает независимо от приложения.

## 6. Данные и миграции {#data}

Data directory переживает container replacement. Startup выполняет совместимые
schema additions. Перед rollout создаётся snapshot; restore останавливает
запись, заменяет базу согласованной копией и запускает health/E2E проверки.

## 7. Контракты {#contracts}

- Production HTTPS endpoint.
- `GET /health`.
- Compose service и volume contract.
- systemd backup service/timer.
- Операторские команды из `docs/OPERATIONS.md`.

## 8. Rollout и восстановление {#rollout}

1. Проверить конфигурацию и свободные ресурсы.
2. Создать snapshot.
3. Собрать и запустить новую версию.
4. Проверить health, MCP и heartbeat обоих worker.
5. При сбое вернуть предыдущий image и совместимую базу.
6. После restore выполнить вертикальный запрос.

## 9. Наблюдаемость {#observability}

Health version, container state/logs, backup timer, snapshot integrity,
heartbeat и queue state. Последний подтверждённый production E2E:
`docs/E2E_RELEASE_0.1.18.md`.

## 10. Трассировка реализации {#traceability}

- `deploy/**`
- `src/coordinator/main.ts`, `src/coordinator/server.ts`
- `docs/DEPLOYMENT_CLAWVPN.md`, `docs/OPERATIONS.md`

## 11. Критерии готовности {#acceptance}

- Coordinator восстанавливается после host/container restart.
- Health доступен по HTTPS.
- SQLite и temporary directory persistent.
- Ежедневный snapshot создаётся и проходит integrity check.
- Mac и Windows heartbeat наблюдаемы после rollout.

## 12. Связи {#relations}

Поддерживает FEAT-001, FEAT-002 и FEAT-004.

## 13. История изменений {#changelog}

- [2026-07-28] Сведены AOP-080–085 и AOP-091.
