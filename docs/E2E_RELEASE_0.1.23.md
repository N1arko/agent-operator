# Release E2E 0.1.23

Дата проверки: 2026-07-31.

## Состав релиза

- FIX-003: active slot сохраняется после timeout Desktop interrupt;
- следующий request ждёт terminal boundary исходного turn;
- поздний progress отменённого request не публикуется;
- подтверждённый interrupt завершает read-only observation;
- несколько observation leases удерживают app-server до завершения каждого;
- потеря read-only app-server восстанавливается новым процессом и повторным
  чтением сохранённой истории.

## Автоматические проверки

- `pnpm typecheck`;
- `pnpm lint`, включая 18 спецификаций и все `spec://`-ссылки;
- 45 тестов из 45;
- timeout interrupt с queued следующим request;
- один result и ноль поздних update отменённого request;
- два параллельных read-only observer;
- восстановление observer после потери app-server.

## Deployment

- coordinator health: `0.1.23`;
- coordinator container: `running`, restart count `0`;
- Mac heartbeat: `0.1.23`, `idle`;
- Windows heartbeat: `0.1.23`, `idle`;
- Windows package:
  `agent-operator-worker-0.1.23.zip`;
- SHA-256:
  `505a1623c69d5a9b3566cabb3279d1eecc2d5ceb9b3fa49fc2fd4f9dd9503c74`;
- backup перед deployment:
  `coordinator-20260731T165924Z.sqlite`.

Наблюдаемая нагрузка VPS после обновления:

| Контейнер | CPU | Память |
|---|---:|---:|
| coordinator | 1.09% | 54.14 MiB / 512 MiB |
| Caddy | 0.13% | 25.98 MiB / 160 MiB |

## Windows post-cutover

- одна пара процессов: host PID `30540`, worker PID `23128`;
- Scheduled Task `Agent Operator Worker` запущена и указывает на
  `C:\Users\nikit\AppData\Local\AgentOperator\0.1.23\run-worker.ps1`;
- diagnose exit `0`, coordinator HTTPS 200, Codex `0.145.0`, проекты 2/2;
- heartbeat `2026-07-31T17:19:49.066Z` и
  `2026-07-31T17:19:57.610Z`;
- production audit: 0 уязвимостей;
- stdout и stderr: 0 байт;
- read-only контрольный turn завершился через worker 0.1.23 и вернул
  post-cutover отчёт.

Первый одноразовый переключатель обнаружил локализованный формат времени
Windows `MM/dd/yyyy HH:mm:ss`. Разбор timestamp исправлен в локальном
cutover-контроллере, после чего переключение завершилось штатно.

## Итог

FIX-003 подтверждён автоматическими регрессиями и живым post-cutover сценарием.
Coordinator и оба worker доступны, очереди пусты, Desktop-задача Windows
выполняется через новую версию.

## Повторная сверка baseline 2026-08-23

Перед началом open-source волны исходники `0.1.23` повторно сопоставлены с
неизменённым production read-only:

- публичный `/health` вернул `{"status":"ok","version":"0.1.23"}`;
- coordinator и Caddy работают без restart с момента rollout;
- server bundle сохранил SHA-256
  `505a1623c69d5a9b3566cabb3279d1eecc2d5ceb9b3fa49fc2fd4f9dd9503c74`;
- Mac и Windows публиковали heartbeat с `worker_version=0.1.23`;
- SHA-256 шести изменённых compiled-файлов coordinator/worker внутри
  запущенного container совпал с локальной сборкой;
- focused regression suite из 12 тестов выполнен трижды: `36/36` passed.

Исторический и повторно собранный worker archives распакованы во временные
каталоги и сравнены манифестами. Из 61 файла 60 совпали побайтно. Различается
только `UPDATE_WINDOWS_0.1.23.md`: опубликованный archive был создан до
добавления в этот документ секции с SHA-256 самого archive. Исполняемый код,
установочные скрипты, skill и остальные документы совпадают.

Свежий `pnpm audit --prod` обнаружил пять advisories в транзитивных
зависимостях MCP SDK, включая один high. Они зарегистрированы как `TD-003` и
блокируют публичный open-source release, сохраняя historical baseline
`0.1.23` неизменным.
