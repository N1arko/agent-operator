# Совместимость и ограничения

[English version](COMPATIBILITY.md)

## Матрица релиза

`v0.2.0-alpha` использует одну версию для coordinator, worker packages, health,
manifests, image labels и release receipt.

| Компонент | Поддерживаемая граница релиза | Evidence до финальной публикации |
|---|---|---|
| Coordinator | Linux container, `amd64` и `arm64`, Docker Compose v2 | Multi-architecture OCI build и Trivy scan на Ubuntu 24.04 |
| macOS worker | Apple Silicon macOS с Node.js 24 | Full lifecycle smoke на `macos-26-arm64`; требуется clean-room host gate |
| Windows worker | 64-bit Windows user session с Node.js 24 | Full lifecycle smoke на Windows Server 2025 x64; требуется clean-room host gate |
| Codex | CLI/Desktop с `codex --version`, `codex mcp` и совместимым app-server/Desktop IPC | Точный public build фиксируется финальным clean-room receipt |

Финальный release receipt является источником точных OS, architecture, Node,
Codex, image digest и package checksums, наблюдавшихся при clean-room acceptance.

## Правила совместимости

- Устанавливайте coordinator и worker из одной release version.
- Worker package проверяет platform, Node major, file manifest и совместимость
  coordinator до переключения.
- Update сохраняет config и durable state и оставляет один предыдущий runtime
  для rollback.
- Читайте release notes перед каждым alpha update. Изменения внутреннего Codex
  app-server и Desktop IPC могут потребовать новый Agent Operator release.
- Native package signing и notarization отсутствуют в alpha. Перед запуском
  проверяйте `SHA256SUMS` и release provenance.

## Известные ограничения

- Один deployment образует один trust domain. Зарегистрированные устройства
  могут отправлять друг другу работу и видеть safe presence и project
  descriptors.
- Один worker исполняет один активный turn. Для worker допускается до трёх
  незавершённых исполняемых requests.
- Coordinator управляется локальными shell scripts. Web admin interface и
  remote enrollment administration API отсутствуют.
- Временный файл ограничен 10 MiB, quota владельца — 50 MiB, одно сообщение —
  20 attachments, TTL — 24 часа.
- Worker packages поставляются как archives с lifecycle scripts. Форматы PKG,
  MSI, App Store и Microsoft Store отсутствуют.
- Coordinator не поддерживает hosted multi-tenant isolation, organization
  roles, schedules и automatic orchestration.
- Публичный HTTPS endpoint требует DNS, firewall, защиты host, monitoring и
  backups со стороны оператора.
- Alpha поддерживает точные комбинации из актуального release receipt. Другие
  OS versions и architectures могут работать без подтверждённой проверки.

## Политика обновлений

Security и compatibility fixes получает новейший опубликованный `0.2.x` alpha.
Исторические alpha artifacts остаются immutable. Неудачный release candidate
получает новую version и tag.
