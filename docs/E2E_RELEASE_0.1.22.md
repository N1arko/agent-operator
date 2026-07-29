# Release E2E 0.1.22

Дата проверки: 2026-07-28.

## Состав релиза

- FIX-001: сериализация follow-up, idempotency и каскадная отмена;
- FEAT-006: промежуточные update с явной нефинальностью;
- FIX-002: model-agnostic профили выбора модели и reasoning;
- atomic inbox claim для одной identity;
- обработка cancellation во время принятия Desktop-turn.

## Автоматические проверки

В локальном дереве выполнены:

- `pnpm typecheck`;
- `pnpm lint`, включая проверку 18 спецификаций;
- 43 теста из 43;
- отдельный вертикальный сценарий cancellation во время startup boundary.

Сценарий startup cancellation задерживает принятие Desktop-turn, отправляет
cancel до регистрации active turn и проверяет, что локальный turn прерван, а
следующий queued request завершается без restart.

## Deployment

- coordinator health: `0.1.22`;
- coordinator container: `running`, restart count `0`;
- Windows package:
  `agent-operator-worker-0.1.22.zip`;
- SHA-256:
  `a941737223ee6e8c10098f30db54cf2392465d622edd185c10532924416c8648`;
- Mac heartbeat: `0.1.22`, `idle`;
- Windows heartbeat: `0.1.22`, `idle`;
- outstanding request после E2E: `0`.

Наблюдаемая нагрузка VPS после E2E:

| Контейнер | CPU | Память |
|---|---:|---:|
| coordinator | 0.78% | 57.68 MiB |
| Caddy | 0.03% | 30.57 MiB |

## Mac → Windows: idempotency и сериализация

В одной Windows Desktop-задаче созданы три явных request:

| Порядок | Request | Result cursor |
|---:|---|---:|
| 1 | `9674ea96-0b29-4646-aeec-a1fb3b968eef` | 453 |
| 2 | `13dfc3a5-665d-4548-b3cf-fef09008c578` | 454 |
| 3 | `cef3b691-ba78-4dca-a27b-5ff98c6be754` | 455 |

Все results связаны с thread
`019fab6f-2013-7103-a56c-618b5d517910`. Повтор root и первого follow-up с тем
же idempotency key вернул исходный message ID. Для каждого request сохранён
один result и один target thread. Result cursors подтверждают
последовательность выполнения.

В цепочке получен progress update с `isFinal: false`; три terminal result
содержат `isFinal: true`.

## Windows → Mac: progress boundary

Request `69052d1f-0628-40d3-b8c5-0310303efc13` создал Mac Desktop-задачу
`019fab72-cec2-70a2-a072-e929c8c37f67`.

- progress update: cursor `459`, `isFinal: false`;
- terminal result: cursor `460`, `isFinal: true`;
- итоговый status: `completed`.

Порядок cursor подтверждает доставку update до финального ответа.

## Профиль выполнения

Сквозные requests сохраняют:

- `executionProfile: fast`;
- точный model ID, выбранный из актуального каталога recipient;
- `reasoningEffort: low`;
- краткий `selectionReason`;
- caller-stable `idempotencyKey`.

Правила skill используют профили `fast`, `balanced`, `deep` и не содержат
названий текущего поколения моделей. Тест skill проверяет это ограничение.

## Живые находки

Во время обновления обнаружены несколько worker одной identity, оставшиеся от
одноразовых переключателей предыдущих версий. Atomic inbox claim выдал новый
request одному процессу. После очистки на Windows подтверждена одна пара
0.1.21, затем она штатно переключена на 0.1.22.

Миграционный restart выявил cancellation boundary до регистрации active turn.
Исправление вошло в 0.1.22 и покрыто детерминированным вертикальным тестом.

## Итог

Три карточки подтверждены тестами, production deployment и двусторонним
Desktop E2E. Очереди пусты, оба worker доступны, coordinator стабилен.
