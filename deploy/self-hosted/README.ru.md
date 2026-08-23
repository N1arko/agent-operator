# Self-hosted coordinator

[English version](README.md)

Этот каталог запускает Agent Operator coordinator на Linux host с Docker
Compose. Локальная конфигурация находится в `.env`, runtime state — в `data/`.
Оба пути исключены из Git.

## Release bundle

Один раз выполните `./bootstrap.sh`. Он создаст `.env` с user-only permissions
и завершится. Укажите свой URL и host:

```dotenv
AOP_PUBLIC_URL=https://operator.example.com
AOP_ALLOWED_HOSTS=operator.example.com,127.0.0.1,localhost
AOP_TLS=true
AOP_DOMAIN=operator.example.com
```

Направьте DNS на этот host, разрешите входящие TCP 80/443 и выполните:

```sh
./bootstrap.sh
./compose.sh ps
./aopctl.sh doctor --json
```

Release bundle уже содержит точный GHCR image tag. Сохраняйте его до
намеренного update с предварительным backup.

## Source checkout

Для local development:

```sh
cd deploy/self-hosted
./bootstrap.sh || test $? -eq 2
# edit .env
./bootstrap.sh --build
```

## Operator commands

```sh
./aopctl.sh device create --id dev-mac --name "Development Mac"
./aopctl.sh device list
./aopctl.sh device revoke dev-mac
./backup.sh
./restore.sh BACKUP_MANIFEST.json --confirm
./compose.sh restart coordinator
./compose.sh logs --tail=100 coordinator
./compose.sh down
```

Backup set содержит manifest, SQLite snapshot и credential key в
`data/backups/`. Restore проверяет checksums и SQLite integrity и создаёт
pre-restore backup до замены state.

## Безопасность

- `bootstrap.sh` задаёт container UID/GID текущего Linux user;
- `data/`, backup files, `.env` и credential key получают owner-only
  permissions;
- container сбрасывает capabilities, использует `no-new-privileges` и
  read-only root filesystem;
- public routing требует TLS, exact allowed host и firewall;
- base HTTP profile привязывается к loopback или private-network address.

Полная документация: <https://github.com/N1arko/agent-operator/tree/main/docs>.
