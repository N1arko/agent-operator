# ADR-0015: Keyed hashing enrollment и device credentials

Дата: 2026-08-23
Статус: принято

## Контекст

Публичный self-hosted coordinator должен выдавать отдельный credential каждому
device, отзывать его без перезапуска и не сохранять plaintext enrollment code
или token. Значения генерируются с высокой энтропией, поэтому медленный
password hash не даёт заметной защиты от перебора. Независимый server-side key
защищает database snapshot от прямого использования credential hashes.

## Решение

Coordinator использует HMAC-SHA-256 с 32-byte credential key и раздельными
domain prefixes для enrollment code и device token. Key создаётся атомарно в
`AOP_DATA_DIR/credential.key`, хранится с mode `0600` и входит в operator backup
вместе с SQLite. Для in-memory тестов передаётся явный ephemeral key.

Enrollment code и device token получают криптографически стойкую случайность и
возвращаются только в командах, которым положено показать их один раз. SQLite
хранит HMAC digest, безопасный suffix token, timestamps и identity metadata.
Authentication вычисляет digest входного bearer token и проверяет persistent
record на каждой request boundary. Legacy `AOP_DEVICE_TOKENS` остаётся отдельным
migration-only resolver до удаления compatibility path.

## Последствия

- database без `credential.key` не позволяет восстановить raw credentials;
- потеря key требует повторного enrollment всех persistent devices;
- backup и restore обязаны переносить SQLite и key как одну единицу;
- смена key требует отдельной controlled migration;
- revoke действует на следующий HTTP/MCP request без reload token map;
- raw code/token запрещены в logs, audit и persistent records.
