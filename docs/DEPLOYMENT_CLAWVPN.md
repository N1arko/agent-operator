# Deployment target: clawvpn

Профиль снят по SSH и deployment выполнен 2026-07-26.

## 1. Назначение

`clawvpn` используется для coordinator Agent Operator:

- Streamable HTTP MCP;
- worker HTTPS API;
- SQLite;
- временные файлы;
- TLS endpoint.

Локальные Codex worker продолжают работать на Mac и Windows.

## 2. Характеристики

| Параметр | Значение |
|---|---|
| SSH alias | `clawvpn` |
| ОС | Ubuntu 22.04.5 LTS |
| Kernel | Linux 5.15 |
| Architecture | x86_64 |
| Virtualization | KVM |
| CPU | 1 vCPU, AMD EPYC 9655 |
| RAM | 1.8 GiB |
| Доступная RAM при проверке | около 1.1 GiB |
| Swap | 255 MiB |
| Root disk | 40 GiB ext4 |
| Свободное место | около 31 GiB |
| Docker | 29.6.2 |
| Host Node.js | 12.22.9 |
| SQLite CLI | 3.37.2 |
| Git | 2.34.1 |

Host Node.js не подходит для выбранного Node.js LTS runtime. Coordinator
разворачивается контейнером с закреплённой версией runtime.

## 3. Существующая нагрузка

Во время проверки работали:

| Контейнер | Назначение | Наблюдаемая память |
|---|---|---|
| `fnf-vpn-node-clawvpn` | VPN node | около 88 MiB |
| `fnf-vpn-cadvisor-clawvpn` | container monitoring | около 47 MiB |
| `fnf-vpn-node-exporter-clawvpn` | host monitoring | около 9 MiB |

Нагрузка CPU является моментальным снимком и меняется вместе с VPN-трафиком.
Coordinator должен сохранять один активный процесс, ограниченный размер
временных файлов и низкую фоновую активность.

## 4. Порты

Во время проверки были заняты:

```text
22
10443
11480
11580
18080
19100
62050
62051
```

Порты 80 и 443 не имели слушающих процессов. Caddy на host отсутствовал.

План:

- Caddy container публикует 80/443;
- coordinator доступен Caddy внутри отдельной Docker network;
- внутренний порт coordinator — `8787`;
- coordinator не публикует внутренний порт напрямую в интернет.

Перед deployment список портов проверяется повторно.

## 5. Каталоги

```text
/opt/agent-operator/
├── deploy/
│   ├── data/db/coordinator.sqlite
│   ├── secrets/
│   ├── backups/
│   ├── compose.yaml
│   └── Caddyfile
└── release/agent-operator-worker-0.1.3.zip
```

## 6. Контейнеры

Deployment:

```text
deploy-coordinator-1
deploy-caddy-1
```

Coordinator image содержит:

- приложение;
- Node.js LTS;
- SQLite runtime;
- health check.

Caddy и coordinator используют отдельную Docker network. Существующие VPN и
monitoring containers не изменяются.

## 7. Ограничения сервера

### CPU

Доступен один vCPU. Coordinator выполняет маршрутизацию и SQLite-операции.
Тяжёлая обработка файлов, архивов и контента остаётся на worker.

### RAM

Доступно около 1.1 GiB с учётом текущей нагрузки. До production deployment
измеряется RSS coordinator. Container memory limit назначается после замера.

### Диск

Свободного места достаточно для SQLite и небольших временных файлов. Для
`transfers` вводятся:

- максимальный размер одного файла;
- общий quota;
- TTL;
- периодическая очистка.

### Runtime

Host Node.js не используется. Сборка и запуск выполняются в Docker.

## 8. TLS и DNS

Публичный URL:

```text
https://agent-operator.188-241-197-83.sslip.io
```

Имя разрешается в публичный IP `clawvpn`. Caddy получает сертификат
Let’s Encrypt с профилем `shortlived` и автоматически обновляет его. Профиль
поддерживает IP-сценарии и снимает зависимость от недельной квоты общего домена
VPS-провайдера.

Coordinator доступен внутри Docker network на `8787`. В интернет опубликованы
80/443 через Caddy.

## 9. Backup

Скрипт `deploy/backup.sh` создаёт согласованный SQLite snapshot и хранит
ежедневные копии семь дней. Перед production-эксплуатацией остаётся добавить
его в системное расписание.

## 10. Фактическая проверка

- `/health` возвращает `200` по доверенному HTTPS;
- coordinator и Caddy работают с лимитами 512 и 160 MiB;
- существующие VPN и monitoring containers продолжают работать;
- Windows bundle отдаётся только с device token;
- удалённый тест через VPS запустил реальный Codex turn на Mac и получил
  `REMOTE_E2E_OK`;
- удалённый тест Mac → VPS → Windows → VPS → Mac получил итоговый текст
  `ready` после восстановления Windows-worker;
- SQLite сохраняется в bind mount при пересоздании container.

## 11. Готовность

Сервер подходит для MVP при следующих условиях:

- coordinator остаётся лёгким;
- обработка Codex выполняется на локальных worker;
- одновременно работает небольшое число подключений;
- временные файлы ограничены quota и TTL;
- deployment не меняет существующие VPN-контейнеры.
