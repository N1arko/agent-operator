# Coordinator

[English version](COORDINATOR.md)

Coordinator — небольшой HTTP/MCP-сервис с SQLite и ограниченным хранилищем
временных файлов. Он запускается на Linux host через Docker Compose. Все
соединения worker исходят с их host.

## Release bundle

Скачайте `agent-operator-self-hosted-VERSION.tar.gz` и `SHA256SUMS` из одного
GitHub Release. Проверьте archive до распаковки. Release bundle содержит точную
ссылку `ghcr.io/n1arko/agent-operator:VERSION`, Compose profiles, Caddy,
operator scripts и manifest файлов.

Первый `./bootstrap.sh` создаёт `.env`. Проверьте его перед вторым запуском.
Созданные `.env`, `data/`, credentials, SQLite и backups остаются на host и
исключены из Git.

## Публичный HTTPS profile

Направьте A/AAAA record на Linux host и откройте входящие TCP 80/443. Задайте:

```dotenv
AOP_PUBLIC_URL=https://operator.example.com
AOP_ALLOWED_HOSTS=operator.example.com
AOP_TLS=true
AOP_DOMAIN=operator.example.com
```

`./bootstrap.sh` запускает coordinator и Caddy. Caddy получает и обновляет TLS
certificate. Coordinator port остаётся закрытым от публичной сети; внешние
запросы принимает Caddy.

## Профиль частной сети

Используйте этот profile, когда все host подключены к VPN или одной private
LAN:

```dotenv
AOP_PUBLIC_URL=http://10.0.0.10:8787
AOP_ALLOWED_HOSTS=10.0.0.10
AOP_TLS=false
AOP_BIND_ADDRESS=10.0.0.10
AOP_HTTP_PORT=8787
```

Разрешите port 8787 только из частной сети. Plain HTTP предназначен для
доверенного private transport. Для internet-routed traffic используйте HTTPS
profile.

## Конфигурация

| Variable | Назначение |
|---|---|
| `AOP_IMAGE` | Точный tag или digest coordinator image |
| `AOP_PUBLIC_URL` | URL в enrollment output и конфигурации worker |
| `AOP_ALLOWED_HOSTS` | Разрешённые HTTP Host через запятую |
| `AOP_TLS` | Включает Caddy Compose profile при `true` |
| `AOP_DOMAIN` | DNS-имя для Caddy |
| `AOP_BIND_ADDRESS` | Bind address host в base profile |
| `AOP_HTTP_PORT` | Port host в base profile |
| `AOP_REQUEST_LEASE_MS` | Lease исполняемого request; по умолчанию два часа |
| `AOP_UID`, `AOP_GID` | Владелец bind-mounted coordinator data |
| `AOP_MEMORY_LIMIT`, `AOP_CPU_LIMIT` | Resource limits coordinator |

`bootstrap.sh` заполняет `AOP_UID` и `AOP_GID` значениями текущего Linux user.
Container работает без root capabilities, с read-only root filesystem и
`no-new-privileges`.

## Управление устройствами

Operator commands выполняются локально через тот же image и data directory:

```sh
./aopctl.sh device create --id dev-mac --name "Development Mac"
./aopctl.sh device list
./aopctl.sh device list --json
./aopctl.sh device revoke dev-mac
./aopctl.sh enrollment revoke ENROLLMENT_ID
```

Enrollment code действует 10 минут, принимается один раз и хранится как keyed
digest. Успешный worker один раз получает собственный device credential.
Revoke отклоняет следующие запросы устройства и сохраняет mailbox data для
operator diagnosis.

## Данные и health

Persistent data находится в `self-hosted/data/`:

- `coordinator.sqlite` — agents, devices, mailbox, task и file metadata;
- `credential.key` — server-side key для credential digests;
- `files/` — ограниченное содержимое временных файлов;
- `backups/` — созданные оператором backup sets.

Проверки:

```sh
./compose.sh ps
./compose.sh logs --tail=100 coordinator
./aopctl.sh doctor --json
curl -fsS https://operator.example.com/health
```

Backup, restore, update и rollback описаны в
[инструкции эксплуатации](../OPERATIONS.ru.md).
