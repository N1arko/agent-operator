# INFRA-003: Доставка и восстановление worker {#root}

## Простыми словами {#plain-language}

Новая версия worker собирается воспроизводимо, проверяется локально, безопасно
устанавливается на Mac и Windows и сохраняет предыдущую версию для отката.

## 1. Цель {#goal}

Зафиксировать release-процесс обоих host и обязательную живую проверку
Desktop delivery.

## 2. Управляющие спеки {#governing-specs}

- `spec://common/PROP-000-workflow#quality`
- `spec://common/PROP-002-STACK#deploy`
- `spec://common/PROP-005-RUNTIME#recovery`
- `spec://modules/worker/INFRA-002-worker-runtime#rollout`

## 3. Контекст {#context}

Windows получает versioned zip bundle с runtime dependency Codex. Mac
использует checkout проекта и LaunchAgent. Coordinator и worker должны
поддерживать один текущий protocol version.

## 4. Сборка и зависимости {#environment}

- `pnpm typecheck`, `pnpm lint`, `pnpm test`.
- Windows bundle создаёт `scripts/package-windows.sh`.
- Package version совпадает с MCP/health worker version.
- SHA-256 фиксирует точный переносимый bundle.
- Production dependency audit выполняется для Windows install.

## 5. Rollout {#rollout}

1. Завершить спецификацию и тесты.
2. Собрать package и проверить checksum.
3. Обновить coordinator при изменении protocol.
4. Обновить Mac worker и дождаться heartbeat.
5. Передать Windows update task в существующий Codex thread.
6. Остановить старый process после проверки CommandLine.
7. Установить versioned directory, переключить Scheduled Task и запустить.
8. Выполнить diagnose и дождаться последовательных heartbeat.
9. Провести живой E2E в обоих направлениях.

## 6. Rollback и recovery {#recovery}

Предыдущий versioned directory сохраняется. Rollback возвращает supervisor на
предыдущий entrypoint. Local state и projects не привязаны к versioned
directory. После возврата проверяются diagnose, heartbeat, queue и контрольный
turn.

## 7. Наблюдаемость {#observability}

Release report фиксирует version, checks, process IDs, heartbeat, agent state,
queue, Desktop thread IDs, число user turn/final/result и пользовательское
подтверждение видимости.

## 8. Трассировка реализации {#traceability}

- `scripts/package-windows.sh`
- `scripts/windows/install-worker.ps1`, `run-worker.ps1`, `diagnose.ps1`
- `scripts/install-macos-launch-agent.mjs`
- `packaging/worker/README.md`, `packaging/worker/README.ru.md`
- `docs/evidence/*.json`, release receipt и GitHub Actions release jobs

## 9. Критерии готовности {#acceptance}

- Полный test suite проходит.
- Package checksum совпадает на принимающем host.
- Supervisor указывает на новую версию.
- Оба worker idle и heartbeat обновляется.
- Queue не содержит лишних executable request.
- Новая и существующая задача видны в Desktop без дубликатов.
- Предыдущая версия доступна для отката.

## 10. Связи {#relations}

Проверяет production-готовность FEAT-002 и FEAT-005.

## 11. История изменений {#changelog}

- [2026-07-28] Описан подтверждённый release-процесс 0.1.18.
