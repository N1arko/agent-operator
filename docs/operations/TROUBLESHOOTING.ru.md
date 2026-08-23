# Диагностика проблем

[English version](TROUBLESHOOTING.md)

Начните с exact version и local doctor output. До передачи logs удалите tokens,
enrollment codes, prompts, results, project paths и file contents.

## Coordinator не становится healthy

```sh
./compose.sh config --quiet
./compose.sh ps
./compose.sh logs --tail=200 coordinator
./aopctl.sh doctor --json --offline
```

Проверьте валидный `AOP_PUBLIC_URL`, exact `AOP_ALLOWED_HOSTS`, release
`AOP_IMAGE` и актуальные `AOP_UID`/`AOP_GID` в `.env`. Проверьте write access к
`data/`, свободное место и поддержку image architecture.

## Ошибка HTTPS или host validation

- Убедитесь, что DNS разрешается в coordinator host.
- Разрешите входящие TCP 80/443 для выдачи Caddy certificate.
- Задайте `AOP_DOMAIN` как DNS name без scheme и path.
- Задайте `AOP_ALLOWED_HOSTS` равным host, который отправляют clients.
- Проверьте Caddy: `./compose.sh logs --tail=200 caddy`.
- Для private HTTP profile привязывайтесь только к private interface и
  используйте один address в `AOP_PUBLIC_URL` и `AOP_ALLOWED_HOSTS`.

## Enrollment отклонён

Создайте новый code и используйте его за 10 минут:

```sh
./aopctl.sh device create --id dev-mac-2 --name "Development Mac"
```

Code является single-use. Unknown, expired, consumed и revoked codes возвращают
одинаковую внешнюю форму отказа. Проверьте local coordinator time, доступность
URL и worker package version. Выберите новый agent ID, если прежняя identity уже
enrolled или revoked.

## Worker doctor завершается ошибкой

Проверьте:

```sh
node --version
codex --version
```

Затем запустите platform doctor. Убедитесь, что configured project directories
существуют и читаются, coordinator URL доступен из user session, service
использует те же Node/Codex, что и terminal.

На macOS проверьте LaunchAgent и local worker error log в install root. На
Windows проверьте Scheduled Task last result и current-user install root. Не
копируйте полные logs в public issue.

### Codex сообщает `error deriving config` или `unknown variant`

Worker service нашёл устаревший внешний Codex CLI, который не читает актуальную
конфигурацию Codex. Выполните `codex --version` в user context сервиса, обновите
официальный Codex CLI, перезапустите worker service и повторите doctor. Версии
Desktop и внешнего CLI могут различаться. Clean-room acceptance baseline этого
релиза — Codex CLI `0.149.0`.

## Agent offline

Agent становится offline после 45 секунд без heartbeat. Запустите local doctor,
перезапустите worker service и проверьте coordinator device list. Revoked
credential требует нового явного enrollment. Network failure обычно возникает
до начала message polling.

## Codex не видит Agent Operator tools

1. Перезапустите Codex после install или update.
2. Выполните `codex mcp get agent-operator` в том же user context.
3. Проверьте bundled skill `coordinate-agents` в active Codex home.
4. Запустите worker doctor.
5. Если unmanaged MCP entry существовал до install, явно удалите его и повторите
   integration install/update.

## Task остаётся queued или active

- Прочитайте agent status и current activity.
- Ждите по cursor из original request.
- Повторно используйте idempotency key только при неизвестном outcome original
  submission.
- Отменяйте obsolete request по exact message ID.
- Проверьте request lease и worker heartbeat.
- Restart worker сохраняет pending state; не создавайте duplicate tasks.

## Ошибка update или rollback

Проверьте checksum и manifest нового package. Update запускается из нового
package. Rollback требует один retained previous runtime. Выполняйте doctor до
service cutover и после rollback. Сохраняйте config и durable state до проверки
результата.

## Ошибка backup restore

Coordinator должен оставаться остановленным во время direct restore. Передайте
manifest basename из `data/backups/` либо container path
`/data/backups/...`. Несовпадение checksum, SQLite integrity или credential key
отклоняет restore. Сохраните current и candidate backup sets для diagnosis.

## Сообщить о проблеме

В bug template укажите version, component, minimal reproduction, expected
result и redacted observed output. Для security issues используйте
[private vulnerability reporting](../../SECURITY.ru.md).
