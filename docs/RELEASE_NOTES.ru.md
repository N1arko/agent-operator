# Agent Operator v0.2.0-alpha

[English version](RELEASE_NOTES.md)

Это первая бесплатная self-hosted open-source release line.

## Состав

- multi-architecture Linux coordinator image и generic Docker Compose/Caddy
  bundle;
- одноразовый device enrollment, список устройств и немедленный revoke
  credential;
- versioned lifecycle packages worker для macOS и Windows;
- Codex MCP и skill integration `coordinate-agents`;
- поиск агентов, проектов и задач, новые задачи, продолжение по точному ID,
  последовательные follow-up, progress, cancel и final result;
- committed Git files и ограниченные temporary attachments;
- backup/restore coordinator и update/rollback/uninstall worker;
- checksums, SPDX SBOM, image scan, provenance и release receipt.

## Миграция

Fresh deployments используют enrollment codes. Private deployment `0.1.23`
может применить документированный migration-only compatibility path для legacy
tokens. Откройте [инструкцию миграции](getting-started/MIGRATION.ru.md).

## Совместимость

Смотрите [матрицу совместимости](getting-started/COMPATIBILITY.ru.md).
Финальный release receipt фиксирует точные clean-room hosts, Codex versions,
image digest и package hashes.

## Известные ограничения

Alpha обслуживает один trust domain владельца, запускает один активный turn на
worker, зависит от совместимости внутреннего Codex app-server/Desktop IPC и
поставляет unsigned worker packages в archives. Полный список находится в
[документе совместимости](getting-started/COMPATIBILITY.ru.md#известные-ограничения).

## Проверка

Скачайте `SHA256SUMS`, проверяйте каждый artifact до запуска и сопоставьте image
и source provenance с release receipt. Public signed attestations и clean-room
evidence являются release gates финальной публикации `v0.2.0-alpha`.
