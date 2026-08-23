# Пустая карточка удалённой задачи после обновления Desktop

Дата: 2026-08-23  
Статус: исправление принято в `main`; macOS и Windows подтверждены

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

Exact revision `b5c2298f3eeb65d07daca4974f9034317fe5c641` прошла main CI и
security workflows. Windows package из этого CI run доставлен на реальный host;
его checksum и manifest проверены. На Windows 10 Home 25H2 с Node.js `24.13.0`,
Codex CLI `0.149.0` и Desktop package `26.818.5229.0` worker подключился к
изолированному coordinator той же revision и передал heartbeat.

Во время Windows turn observer открыл целевой Codex task и подтвердил видимый
prompt, commentary `WINDOWS_APP_DISAMBIGUATION_RUNNING_OK`, активную работу и
отсутствие writer conflict. Initial turn и два follow-up завершились ожидаемыми
terminal markers. Worker log за интервал проверки не содержал Desktop rejection,
headless fallback, IPC error или acceptance timeout.

Clean-room выявил две дополнительные границы совместимости. Windows PowerShell
5.1 не принимает `Set-Content -Encoding utf8NoBOM`, поэтому release runner пишет
UTF-8 без BOM через `System.Text.UTF8Encoding(false)`. Codex CLI `0.114.0` не
читает актуальную конфигурацию Codex; Windows acceptance выполнен на официальном
CLI `0.149.0`.
