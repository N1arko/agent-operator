# WI-012: Закрыть advisories production-зависимостей

- Kind: `fix`
- Canon action: `none`

## Outcome

Production dependency graph проходит актуальный audit без известных advisories после минимальных совместимых обновлений.

## Specs

- Governing: `spec://modules/distribution/INFRA-004-open-source-release#ci`
- Governing: `spec://modules/distribution/INFRA-004-open-source-release#security`
- Constraint: `spec://common/PROP-007-OPEN-SOURCE#acceptance`
- Governing: `spec://common/PROP-006-API#errors`
- Constraint: `spec://modules/coordinator/FEAT-007-device-enrollment#acceptance`

## Scope

- In: актуальный audit, официальные advisories, необходимые версии production-зависимостей и lockfile, frozen install, typecheck, lint, tests, production build, повторный audit, локальные распространяемые artifacts, установка из archives, bounded MCP/SSE/HTTP smoke и release-readiness conclusion, минимальное исправление обнаруженной утечки malformed JSON в parser diagnostics и regression-тест, commit/push рабочей ветки, draft PR и проверка CI exact revision.
- Out: merge, production deploy, credentials, OAuth-конфигурация, permissions, сетевые настройки, Desktop/worker изменения параллельной работы.

## Acceptance

- [x] Baseline findings воспроизведены текущим production audit.
- [x] Исправленные версии сверены с официальными advisories и совместимыми диапазонами родителей.
- [x] Frozen install воспроизводит исправленный dependency graph.
- [x] Typecheck, lint, docs check, tests и production build проходят.
- [x] Повторный production audit разделяет закрытые, оставшиеся и неподтверждённые findings.
- [x] Изолированный локальный diff и evidence доступны без изменения исходного checkout.

- [x] Доступные локальные artifacts проверены на состав и checksum; границы container validation явно указаны.
- [x] Bounded runtime smoke проверяет некорректный вход, обрыв соединения, восстановление и секреты в ответах.

- [ ] Рабочая ветка опубликована без изменения чужого checkout; remote SHA подтверждён.
- [ ] Draft PR создан; CI exact revision завершён и результат зафиксирован.

## Result

Проверка выполнена 2026-10-13 на baseline `d3b816abec618e5753d355a1850b68ba93a1cdc5`.

Production audit воспроизвёл 18 advisories: 1 critical, 6 high, 11 moderate. После исправлений актуальный `pnpm audit --prod --json` вернул пустой `advisories` и нулевые счётчики всех severity (94 dependency entries). Все исходные находки закрыты в resolved graph; оставшихся и неподтверждённых findings текущего audit нет. Эксплуатируемость каждого advisory в приложении отдельно не оценивалась.

| Package | Было | Стало | Закрытые advisories | Источник исправленной версии |
|---|---|---|---|---|
| `@modelcontextprotocol/sdk` | 1.30.0 | 1.31.0 | 1 high | [GHSA-6qxp-vccf-f47h](https://github.com/advisories/GHSA-6qxp-vccf-f47h) |
| `fast-uri` | 3.1.5 | 3.1.8 | 5 high, 1 moderate | [GHSA-hrr3-gc8f-f4qj](https://github.com/advisories/GHSA-hrr3-gc8f-f4qj) |
| `hono` | 4.13.3 | 4.13.7 | 4 moderate | [GHSA-hxh3-vqpv-xpqv](https://github.com/advisories/GHSA-hxh3-vqpv-xpqv) |
| `ip-address` | 10.3.1 | 10.7.1 | 4 moderate | [GHSA-h3mg-xc3c-68pw](https://github.com/advisories/GHSA-h3mg-xc3c-68pw), [GHSA-j6r3-76f7-8jcv](https://github.com/advisories/GHSA-j6r3-76f7-8jcv) |
| `proxy-addr` | 2.0.7 | 2.0.8 | 1 critical | [GHSA-jqcg-44mw-7w3h](https://github.com/jshttp/proxy-addr/security/advisories/GHSA-jqcg-44mw-7w3h) |
| `qs` | 6.15.3 | 6.16.0 | 2 moderate | [GHSA-4mjr-xmp4-gh2g](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g) |

Обновлены direct SDK pin и security overrides в `package.json` и `pnpm-workspace.yaml`, пересчитан `pnpm-lock.yaml`. Новые overrides сохраняют совместимые диапазоны родителей: Express `proxy-addr ^2.0.7` и `qs ^6.14.0`, body-parser `qs ^6.15.2`, express-rate-limit `ip-address ^10.2.0`; существующие AJV `fast-uri ^3.0.1` и SDK `hono ^4.11.4` также соблюдены. Изменились версии ровно шести пакетов; версии остальных production и всех dev dependencies сохранены. pnpm нормализовал часть peer snapshot identifiers и добавил registry deprecation metadata ESLint.

SDK upgrade notes проверены по [официальному release 1.31.0](https://github.com/modelcontextprotocol/typescript-sdk/releases/tag/1.31.0). Runtime использует MCP server, тестовые clients не настраивают OAuth providers. Адаптация кода, credentials и OAuth-конфигурации не потребовалась.

Проверки на Node `24.19.0`, pnpm `11.9.0`:

- Чистый `pnpm install --frozen-lockfile`: успешен, 200 packages.
- Повторный `pnpm install --frozen-lockfile --offline`: успешен; SHA256 lockfile сохранён.
- `pnpm typecheck`: успешен.
- `pnpm lint`: успешен, включая spec lint и docs check (32 documents, 11 EN/RU pairs, 0 broken links).
- `pnpm test`: 69/69, 14 suites, 0 failed/skipped/cancelled; включая HTTP, MCP, vertical scenario и isolated worker package lifecycle.
- `pnpm build` и `pnpm build:production`: успешны.
- `pnpm licenses list --prod --json`: успешен.
- `git diff --check`: успешен.

Первый запуск тестов в ограниченном sandbox получил `listen EPERM` на loopback; повторный разрешённый запуск полного набора прошёл. Системные сетевые настройки не менялись.

Изменения выполнены в отдельной локальной ветке `codex/wi-012-production-dependencies`. Исходный checkout и его незакоммиченная Desktop/worker работа сохранены. Push, PR и deploy не выполнялись. Production deployment и published artifacts сохраняют прежние зависимости до отдельного rollout; локальный source graph, доступные archives и production-only staged runtime проверены. Новые TECHDEBT не появились.


### Дополнительная проверка artifacts и runtime

- Worker archives macOS/Windows собраны дважды с совпадающими SHA256, распакованы в fresh temporary directories и установлены через изолированные lifecycle profiles. Полный test suite проверяет install/heartbeat/doctor/update/rollback/uninstall, отсутствие воздействия на глобальную Windows Scheduled Task и сохранность пользовательских файлов. Windows profile исполнялся через PowerShell на macOS; live acceptance на Windows этим не заменяется.
- Manifest checksums подтверждены для всех 705 files macOS, 707 files Windows и 12 files self-hosted bundle. Runtime-зависимость worker archives — только `zod 4.2.1`; копий шести затронутых пакетов нет. Self-hosted bundle содержит deployment templates и не содержит coordinator runtime/image.
- Чистый temporary coordinator stage воспроизведён из patched manifests через `pnpm install --prod --frozen-lockfile --offline`: 94 packages, 0 downloads, без dev dependencies. Подтверждены фактические шесть patched versions в installed node_modules; audit этого stage сообщает 0 advisories.
- Bounded smoke в `NODE_ENV=production` прошёл MCP initialize, SDK HTTP client/listTools, malformed JSON-RPC, unknown method, unauthorized/Accept/GET errors, aborted request и fresh request recovery; forged X-Forwarded-For не обходит enrollment rate limit, bracket query не вызывает prototype pollution. Прямые probes patched proxy-addr/fast-uri/qs также прошли.
- Product endpoint использует JSON responses (`enableJsonResponse: true`), SSE-only Accept получает 406, GET получает 405. Отдельный локальный SSE fixture использует product MCP server и staged SDK/Hono adapter с `enableJsonResponse: false`; initialize, обрыв stream и последующий request проходят. Публичный route не менялся для SSE.
- Malformed JSON probe обнаружил утечку canary в стандартный Express diagnostic log при production environment; в development environment canary также попадал в HTTP error response. `entity.parse.failed` теперь обрабатывается до default error handler: HTTP 400 `invalid_json`, enrollment сохраняет generic `enrollment_denied`. Тело запроса и parser stack в ответ/лог не передаются. Добавлен один regression-тест для MCP, heartbeat и enrollment, воспроизведён его failure до исправления и успешный полный прогон 69/69 после исправления. Повторный production smoke: 0 response leaks, 0 parser log leaks, 0 captured errors.
- После runtime fix typecheck, lint/spec/docs checks, build и production build прошли. Dependency graph сохранился; final stage audit нулевой.

Ограничение: Docker CLI доступен, daemon sockets обоих локальных contexts отсутствуют. Coordinator container image здесь не собран, его base OS image scan и Linux image smoke не подтверждены. Daemon и services не запускались; сетевые настройки сохранены. Локальные archives построены из dirty checkout и содержат base revision в manifest; они служат verification evidence. После принятия patch нужно создать source commit и заново собрать exact release artifact set с этой revision.

Утром можно переносить source diff, archived WI и BOARD row. Последующий container build/scan при доступном Docker, Windows live acceptance по WI-011 и exact CI/release artifact rebuild ещё необходимы перед release. Push и draft PR разрешены отдельным поручением пользователя 2026-10-13. Merge, publication и production deployment остаются за границами текущего прохода; migration/rollout/replacement действующего runtime выполняются отдельно. В каноническом Backlog нет зарегистрированных WI; активные WI-010/WI-011 не начинались и не изменялись.
