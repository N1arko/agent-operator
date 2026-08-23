# Инцидент: потеря границы turn после timeout interrupt

## Наблюдение

В Mac thread `019fb8e9-9888-7022-8698-96075162462d` отмена активного request
получила timeout от `thread-follower-interrupt-turn`. Worker освободил active
slot, и следующий request был передан в продолжающийся Desktop-turn.

## Последствия

- два пользовательских input оказались в одном turn;
- progress нового действия сохранил ownership отменённого request;
- второй read-only observer ожидал отдельный turn;
- завершение первого observer запустило idle stop app-server;
- второй request получил ложный `failed: app-server is not running` после
  фактического успешного финала в Desktop;
- заранее поставленный в очередь status request выполнился после основной
  работы и выглядел как позднее сообщение.

Ручной `interrupted` финального audit-turn был действием пользователя и к
дефекту не относится.

## Первопричина

`Worker.receiveCancellation` очищал `active` и запускал очередь независимо от
результата interrupt. `CodexAppServer` управлял idle timer без учёта нескольких
одновременных `waitForTurn`.

## Исправление

FIX-003 удерживает неостановленный turn в draining, завершает observation после
подтверждённого interrupt и считает активные read-only observations перед idle
stop. Потерянный app-server восстанавливается чтением сохранённой истории.

## Проверка

- регрессия timeout interrupt с queued следующим request;
- отсутствие второго coordinator result после позднего terminal исходного turn;
- два параллельных observer переживают завершение первого и его idle timeout;
- полный typecheck, lint и test suite.

## Результат

Инцидент закрыт в версии 0.1.23. Полный набор из 45 тестов прошёл, coordinator
и оба worker развёрнуты на новой версии. Windows post-cutover turn подтвердил
одну пару процессов, два heartbeat, `idle`, diagnose exit 0 и пустые журналы.

Живые доказательства сохранены в Git tag `v0.1.23`; актуальные релизы публикуют
машиночитаемый receipt среди GitHub Release assets.
