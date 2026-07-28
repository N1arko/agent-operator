# FEAT-004: Передача файлов {#root}

## Простыми словами {#plain-language}

Committed файл передаётся проверяемой Git-ссылкой. Обычный локальный файл
временно проходит через coordinator и удаляется после результата или TTL.

## 1. Цель {#goal}

Передавать нужный артефакт между host без копирования проектов на VPS.

## 2. Управляющие спеки {#governing-specs}

- `spec://common/PROP-001-DATA#sources`
- `spec://common/PROP-005-RUNTIME#state`
- `spec://common/PROP-006-API#idempotency`
- `spec://modules/coordinator/PROP-100-coordinator#rules`

## 3. Границы {#scope}

Входят `git_file`, `temporary_file`, checksum, quota, TTL, download и cleanup.
Автоматическое применение commit и крупное object storage за границей.

## 4. Сценарии {#scenarios}

### Git-файл {#scenarios.git}

1. Caller передаёт repository, commit hash, relative path и SHA-256.
2. Worker сопоставляет remote выбранного project.
3. При необходимости выполняет fetch object.
4. Проверяет commit, path и checksum через Git object database.
5. Добавляет проверенный manifest в prompt без checkout и смены ветки.

### Временный файл {#scenarios.temporary}

1. Caller загружает файл с recipient и idempotency key.
2. Coordinator проверяет размер/quota, вычисляет SHA-256 и назначает UUID.
3. Attachment metadata добавляются в task request.
4. Recipient скачивает в каталог, привязанный к message/file ID, и проверяет
   срок, размер и checksum.
5. Codex получает локальный абсолютный путь.
6. После result worker отправляет ack и удаляет локальную копию.
7. Coordinator удаляет файл после ack либо TTL.

## 5. Данные {#data}

`git_file`: repository, revision 7–64 hex, безопасный относительный path,
SHA-256.

`temporary_file`: fileId, безопасное name, size, SHA-256, expiresAt.

Лимиты: 10 MiB на файл, 50 MiB на owner, 20 attachments на message, TTL 24
часа.

## 6. Контракты {#contracts}

Coordinator предоставляет upload, recipient download и ack HTTP. MCP
проверяет точное совпадение owner, recipient и attachment metadata перед
созданием message.

## 7. Ошибки {#errors}

Несовпадение repository, commit, path, checksum, owner/recipient, quota или
TTL завершает request до запуска Codex либо отклоняет файловую операцию.
Cleanup остаётся безопасным при повторе.

## 8. Трассировка реализации {#traceability}

- `src/shared/protocol.ts`
- `src/coordinator/temporary-files.ts`, `src/coordinator/server.ts`
- `src/worker/git-file.ts`, `src/worker/temporary-file.ts`
- `test/git-file.test.ts`, `test/temporary-file.test.ts`, `test/http.test.ts`

## 9. Критерии готовности {#acceptance}

- Git-файл читается с сохранением текущей ветки и working tree.
- Temporary file проходит реальный Mac → Windows E2E.
- Несовпадающий checksum отклоняется.
- После result локальная и VPS-копии очищаются.
- Просроченный файл недоступен.

## 10. Связи {#relations}

Attachments используются FEAT-002 и разрешаются worker.

## 11. История изменений {#changelog}

- [2026-07-28] Сведены AOP-050–056 и AOP-071 версии 0.1.18.
