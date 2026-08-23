# Self-hosted coordinator

Этот каталог запускает coordinator на Linux host с Docker Compose. Конфигурация
хранится в локальном `.env`, runtime state — в `data/`. Оба пути исключены из
Git.

## Первый запуск из release bundle

Распакуйте `agent-operator-self-hosted-VERSION.tar.gz`, перейдите в каталог
`self-hosted` и выполните:

```sh
./bootstrap.sh
```

Первый вызов создаёт `.env` и останавливается. Release bundle уже содержит
точную GHCR image reference. Укажите собственные `AOP_PUBLIC_URL` и
`AOP_ALLOWED_HOSTS`; для HTTPS также задайте `AOP_TLS=true`, `AOP_DOMAIN` и
направьте DNS на host. Повторный `./bootstrap.sh` запускает coordinator.

## Первый запуск из source checkout

```sh
cd deploy/self-hosted
./bootstrap.sh
```

Первый вызов создаёт `.env` и останавливается. Укажите собственные
`AOP_PUBLIC_URL` и `AOP_ALLOWED_HOSTS`. Для HTTPS также установите
`AOP_TLS=true`, `AOP_DOMAIN` и направьте DNS на host. Затем выполните:

```sh
./bootstrap.sh --build
./aopctl.sh device create --id studio-mac --name "Studio Mac"
```

Base profile публикует coordinator на
`AOP_BIND_ADDRESS:AOP_HTTP_PORT` и подходит для loopback, VPN или внешнего
reverse proxy. TLS profile запускает Caddy на 80/443 и автоматически получает
сертификат для `AOP_DOMAIN`.

## Операции

```sh
./compose.sh ps
./aopctl.sh doctor --json --offline
./aopctl.sh device list
./backup.sh
./restore.sh agent-operator-YYYYMMDDTHHMMSSS...json --confirm
./compose.sh restart coordinator
./compose.sh down
```

Backup manifest, SQLite snapshot и credential key находятся в
`data/backups/`. Restore требует остановки coordinator, проверяет checksums и
SQLite integrity и сначала сохраняет pre-restore backup текущего состояния.

Для регулярного backup запускайте `backup.sh` внешним scheduler host. Retention
в alpha управляется владельцем deployment.

## Права и безопасность

- `bootstrap.sh` задаёт container UID/GID равными текущему Linux user;
- `data/`, backup files и credential key получают owner-only permissions;
- container работает без root capabilities, с read-only root filesystem;
- `.env`, `data/`, tokens и backup artifacts не добавляются в Git;
- для internet profile обязательны TLS, exact allowed host и firewall.
