# TECHDEBT

## Open

### TD-001: Зависимость Desktop delivery от локального IPC

- area: `worker`
- related: `spec://modules/worker/FEAT-005-desktop-visible-delivery#contracts`
- current state: worker использует локальный follower IPC Codex Desktop,
  подтверждённый E2E на macOS и Windows.
- risk: изменение внутреннего протокола Desktop может остановить видимую
  доставку или потребовать обновления handshake.
- условие проявления: новая версия Desktop перестаёт принимать текущие
  follower-команды или меняет формат snapshot.
- mitigation: регрессионные тесты протокола, версионированный handshake,
  headless fallback до принятия Desktop-команды и живой E2E релиза.
- условие закрытия: появляется поддерживаемый внешний API Desktop с теми же
  гарантиями или текущий протокол получает стабильный контракт.

### TD-002: Worker-local registry проектов

- area: `worker`
- related: `spec://modules/worker/FEAT-003-local-targeting#data`
- current state: стабильные project ID и абсолютные пути принадлежат локальному
  `projects.json`; coordinator получает только дескрипторы.
- risk: переименование или перенос папки требует обновить локальное
  сопоставление.
- условие проявления: configured path перестаёт существовать или меняется
  вручную.
- mitigation: диагностика availability, явная локальная конфигурация и
  повторная публикация дескрипторов.
- условие закрытия: Codex предоставляет стабильный поддерживаемый API проектов
  или worker получает безопасное автоматическое переобнаружение.

## Resolved

Записей нет.
