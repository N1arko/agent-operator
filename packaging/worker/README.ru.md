# Пакет Agent Operator worker

Пакет устанавливает versioned worker Agent Operator для одного пользователя
macOS или Windows. До установки нужны Node.js 24+ и Codex.

Установщик принимает URL вашего coordinator, свежий одноразовый enrollment
code и хотя бы один путь локального проекта. Используйте platform script из
`bin/macos` или `bin/windows`. Команда `doctor` проверяет coordinator, Codex и
проекты. `update` сохраняет конфигурацию и durable state, `rollback` возвращает
предыдущую установленную версию. `uninstall` всегда требует явный scope.

Точные команды и support matrix находятся в документации публичного
репозитория.
