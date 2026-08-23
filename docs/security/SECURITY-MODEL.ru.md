# Модель безопасности и приватности

[English version](SECURITY-MODEL.md)

## Trust boundary

Один deployment образует один trust domain. Владелец управляет shell access к
coordinator, DNS/TLS, firewall, backups и membership устройств. Каждое
зарегистрированное устройство может видеть safe presence и project descriptors
и отправлять работу другим зарегистрированным устройствам.

Для пользователей или устройств без взаимного доверия используйте отдельные
deployments.

## Расположение данных

| Данные | Coordinator | Worker host |
|---|---:|---:|
| Device IDs, names, platform, version, heartbeat | да | собственная identity |
| Project ID, display name, tags, availability | да | да |
| Absolute project path и source tree | нет | да |
| Request text, progress, result, task binding | да | active/local copy |
| Полный локальный список Codex tasks | нет | да |
| OpenAI/Codex account credentials | нет | да |
| Plaintext device credential | возвращается один раз | да |
| Keyed digest device/enrollment | да | нет |
| Temporary file bytes | до ack/TTL | во время task получателя |

Coordinator SQLite и backups могут содержать prompts, results, task IDs,
project display metadata и delivery history. Защищайте их как private data.

## Authentication

- Operator создаёт enrollment codes только через локальный `aopctl`.
- Code действует 10 минут и используется один раз.
- Codes и device tokens хранятся в SQLite как server-keyed digests.
- Plaintext device token возвращается один раз и сохраняется worker с правами
  текущего user.
- Revoke отклоняет будущие HTTP и MCP requests устройства.
- Authentication failures используют ограниченный общий ответ для unknown,
  expired, consumed и revoked enrollment codes.

## Сеть

Public routing требует HTTPS, exact allowed host, ограниченный host access и
firewall. Packaged Caddy profile завершает TLS. Base HTTP profile подходит для
loopback, private LAN, VPN или operator-managed reverse proxy.

Worker инициирует исходящие heartbeat, long-poll, message и file requests.
Входящие ports worker не нужны.

## Containers и supply chain

Coordinator container работает с настроенными host UID/GID, без Linux
capabilities, с `no-new-privileges`, read-only root filesystem, resource limits
и writable data mount. Release images используют pinned base digests.

Каждый release содержит `SHA256SUMS`, SPDX SBOM, vulnerability scan, build
provenance и release receipt, связанные с immutable tag и commit. Проверяйте
artifacts до запуска. Worker archives в alpha не имеют native signature.

## Retention и удаление

- Лимит temporary file: 10 MiB на файл, 50 MiB на owner, 20 attachments на
  message, TTL 24 часа.
- Downloaded temporary files удаляются после terminal result; coordinator copy
  удаляется после acknowledgement или TTL.
- Revoke сохраняет mailbox/task history для diagnosis.
- Worker uninstall сохраняет config и state без явных delete flags.
- Backup retention в alpha задаёт operator.

## Logs

Не включайте в debug logs prompts, results, credentials, enrollment codes,
local paths и file contents. Для issues используйте redacted logs. Security
reports отправляйте через [private vulnerability reporting](../../SECURITY.ru.md).

## Риски вне alpha model

Alpha не содержит tenant isolation, per-project authorization, fine-grained
roles, remote admin API, hardware-backed credential storage и native worker
package signing. Скомпрометированное зарегистрированное устройство может
отправлять работу внутри trust domain. Скомпрометированный coordinator может
читать сохранённые mailbox и temporary file data и подменять routing decisions.
