# INFRA-002: Локальный worker runtime {#root}

## Простыми словами {#plain-language}

Worker запускается фоном после входа пользователя, почти не расходует ресурсы
в ожидании, получает задачи через исходящее соединение и лениво запускает
Codex.

## 1. Цель {#goal}

Обеспечить постоянно доступного исполнителя на macOS и Windows с устойчивой
очередью, диагностикой и bounded resource use.

## 2. Управляющие спеки {#governing-specs}

- `spec://common/PROP-002-STACK#environments`
- `spec://common/PROP-005-RUNTIME#processes`
- `spec://modules/worker/PROP-101-worker#rules`

## 3. Окружения и зависимости {#environment}

- Node.js 24.
- npm dependency `@openai/codex` в Windows bundle или configured Codex binary.
- Git для `git_file`.
- HTTPS coordinator.
- macOS LaunchAgent либо Windows Scheduled Task.
- Пользовательская сессия Desktop для visible delivery.

## 4. Канонические решения {#decisions}

- Worker остаётся запущенным, выполняя heartbeat и long poll.
- Codex app-server стартует по запросу и останавливается после idle timeout.
- Активные read-only observation leases откладывают idle stop app-server до
  завершения последнего наблюдателя.
- Один process worker обслуживает одну identity.
- Один активный turn сохраняет предсказуемость локального Codex.
- Локальные config/state/temp directories задаются явно.

## 5. Runtime {#runtime}

Startup загружает projects/state, проверяет coordinator и Codex, публикует
heartbeat и начинает long poll. При request state сохраняется до
acknowledgement, затем item выполняется или ждёт очередь. Shutdown завершает
polling, активные handles и app-server.

## 6. Данные и состояние {#data}

`projects.json` и worker-state локальны. Pending queue и bindings переживают
restart. Временные downloads разделены по message/file ID и очищаются после
result. App-server process является пересоздаваемым.

## 7. Точки входа {#contracts}

- `pnpm worker`;
- `pnpm diagnose`;
- macOS LaunchAgent scripts;
- Windows `run-worker.ps1`, `diagnose.ps1` и Scheduled Task;
- environment contract из `.env.example` и platform installers.

## 8. Rollout и восстановление {#rollout}

Worker останавливается после проверки точного процесса, переключается на новую
версию и запускается штатным supervisor. При сбое supervisor или оператор
возвращает предыдущий каталог. Durable inbox и local pending восстанавливают
незавершённую работу согласно lease.

## 9. Наблюдаемость {#observability}

Диагностика проверяет HTTPS, identity, Codex, args, проекты и exit code.
Heartbeat должен обновляться последовательно. Idle worker не вызывает модель.
stdout/stderr и active request используются для диагностики.

## 10. Трассировка реализации {#traceability}

- `src/worker/main.ts`, `src/worker/client.ts`, `src/worker/worker.ts`
- `src/worker/state.ts`, `src/worker/app-server.ts`
- `scripts/configure-macos.mjs`, `scripts/install-macos-launch-agent.mjs`
- `scripts/windows/**`
- `test/state.test.ts`, `test/app-server.test.ts`, `test/vertical.test.ts`

## 11. Критерии готовности {#acceptance}

- Worker автоматически запускается после входа пользователя.
- Heartbeat восстанавливается после restart host/process.
- Pending request не теряется.
- Idle runtime не вызывает Codex model.
- Diagnose завершается успешно на Mac и Windows.
- App-server завершается после idle timeout.

## 12. Связи {#relations}

Поддерживает FEAT-003, FEAT-004 и FEAT-005.

## 13. История изменений {#changelog}

- [2026-07-31] Версия 0.1.23 добавила reference-counted observation leases для
  lifecycle app-server и развёрнута на coordinator, Mac и Windows.
- [2026-07-28] Сведены AOP-030–044, 086, 087 и 092.
