# Пустая карточка удалённой задачи после обновления Desktop

Дата: 2026-08-23  
Статус: исправлено в release candidate `0.2.0-alpha`

## Симптом

Agent Operator создавал задачу в Codex Desktop на macOS и Windows. Во время
выполнения карточка оставалась пустой и показывала конфликт активного writer.
Prompt и итоговый ответ появлялись после завершения headless turn.

## Причина

Текущий Desktop использует `thread-follower-start-turn` версии 2 и принимает
параметры через `turnStart.request` и `turnStart.context`. Worker отправлял
прежний v1 payload. После обновления отдельный app-server, создавший новый
thread, также оставался его активным writer до idle timeout.

Desktop не принимал follower turn. Worker корректно применял разрешённый
fallback до принятия команды, поэтому задача выполнялась и возвращала результат
через headless app-server. Видимый renderer при этом оставался follower другого
writer и не получал live state.

## Исправление

- после создания нового thread worker завершает создавший его app-server и
  освобождает writer;
- follower start использует v2 envelope с идентификатором thread и user
  message;
- timeout принятия увеличен до 60 секунд с учётом запуска Desktop host;
- interrupt получает свежий owner snapshot перед отправкой команды;
- регрессионные тесты фиксируют wire contract и порядок освобождения writer.

## Проверка

На macOS с Desktop `26.818.41509` и Codex `0.149.0-alpha.4.1` выполнен свежий
turn через тот же путь, что использует worker:

1. пустой thread создан и writer app-server освобождён;
2. Desktop принял follower turn v2;
3. во время `sleep 45` карточка показывала prompt, commentary
   `LIVE_VIEW_RUNNING_OK`, активную команду и индикатор выполнения;
4. read-only observer получил `completed` и `LIVE_VIEW_COMPLETED_OK`;
5. конфликт writer в карточке отсутствовал.

Windows live-view остаётся обязательным exact-package gate WI-010 перед
публикацией.
