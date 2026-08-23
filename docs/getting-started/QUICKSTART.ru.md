# Быстрый старт

[English version](QUICKSTART.md)

Эта инструкция создаёт один coordinator и подключает один macOS worker и один
Windows worker. Замените `operator.example.com` и пути проектов своими
значениями. Используйте только release artifacts.

## 1. Требования

- Linux `amd64` или `arm64` host с Docker Engine и Docker Compose v2;
- DNS-имя, направленное на host, и входящие TCP 80/443;
- пользовательские сессии macOS и Windows с Node.js 24 и актуальным официальным
  `codex` в `PATH` (clean-room acceptance baseline: CLI `0.149.0`);
- shell-доступ ко всем трём host.

Для частной сети используйте профиль из
[инструкции coordinator](COORDINATOR.ru.md#профиль-частной-сети).

## 2. Скачивание и проверка coordinator bundle

Выполните на Linux host:

```sh
VERSION=0.2.0-alpha
BASE_URL="https://github.com/N1arko/agent-operator/releases/download/v${VERSION}"
curl -fLO "${BASE_URL}/agent-operator-self-hosted-${VERSION}.tar.gz"
curl -fLO "${BASE_URL}/SHA256SUMS"
grep "  agent-operator-self-hosted-${VERSION}.tar.gz$" SHA256SUMS | sha256sum --check -
mkdir agent-operator
tar -xzf "agent-operator-self-hosted-${VERSION}.tar.gz" -C agent-operator
cd agent-operator/self-hosted
```

## 3. Запуск coordinator

Первый bootstrap создаёт приватный `.env` и завершается с кодом 2:

```sh
./bootstrap.sh || test $? -eq 2
```

Откройте `.env` и задайте значения:

```dotenv
AOP_PUBLIC_URL=https://operator.example.com
AOP_ALLOWED_HOSTS=operator.example.com,127.0.0.1,localhost
AOP_TLS=true
AOP_DOMAIN=operator.example.com
```

Запустите сервисы и проверьте health:

```sh
./bootstrap.sh
./compose.sh ps
curl -fsS https://operator.example.com/health
./aopctl.sh doctor --json
```

## 4. Enrollment macOS worker

Создайте одноразовый code на coordinator host:

```sh
./aopctl.sh device create --id dev-mac --name "Development Mac"
```

Перенесите показанный `Code` на macOS host. Code действует 10 минут и
используется один раз. Скачайте worker package на macOS:

```sh
VERSION=0.2.0-alpha
BASE_URL="https://github.com/N1arko/agent-operator/releases/download/v${VERSION}"
curl -fLO "${BASE_URL}/agent-operator-worker-macos-${VERSION}.tar.gz"
curl -fLO "${BASE_URL}/SHA256SUMS"
grep "  agent-operator-worker-macos-${VERSION}.tar.gz$" SHA256SUMS | shasum -a 256 --check
mkdir agent-operator-worker
tar -xzf "agent-operator-worker-macos-${VERSION}.tar.gz" -C agent-operator-worker
cd agent-operator-worker
read -r AOP_ENROLLMENT_CODE
./bin/macos/install.sh \
  --coordinator-url https://operator.example.com \
  --enrollment-code "$AOP_ENROLLMENT_CODE" \
  --project "$HOME/Projects/example"
./bin/macos/doctor.sh
```

Installer проверяет manifest пакета, использует code, сохраняет device
credential с правами текущего пользователя, настраивает MCP `agent-operator` и
skill `coordinate-agents`, запускает doctor и создаёт LaunchAgent. После первой
установки integration перезапустите Codex.

## 5. Enrollment Windows worker

Создайте следующий одноразовый code:

```sh
./aopctl.sh device create --id dev-windows --name "Development Windows PC"
```

В PowerShell на Windows:

```powershell
$Version = "0.2.0-alpha"
$BaseUrl = "https://github.com/N1arko/agent-operator/releases/download/v$Version"
$Asset = "agent-operator-worker-windows-$Version.zip"
Invoke-WebRequest "$BaseUrl/$Asset" -OutFile $Asset
Invoke-WebRequest "$BaseUrl/SHA256SUMS" -OutFile "SHA256SUMS"
$Line = Get-Content "SHA256SUMS" | Where-Object { $_ -match "  $([regex]::Escape($Asset))$" }
$Expected = ($Line -split "\s+")[0].ToLowerInvariant()
$Actual = (Get-FileHash -Algorithm SHA256 $Asset).Hash.ToLowerInvariant()
if ($Actual -ne $Expected) { throw "Checksum mismatch for $Asset" }
Expand-Archive $Asset -DestinationPath "agent-operator-worker"
Set-Location "agent-operator-worker"
$EnrollmentCode = Read-Host "Enrollment code"
.\bin\windows\install-worker.ps1 `
  -CoordinatorUrl "https://operator.example.com" `
  -EnrollmentCode $EnrollmentCode `
  -Project "$HOME\Projects\example"
.\bin\windows\diagnose.ps1
```

Installer создаёт Scheduled Task текущего пользователя и такую же Codex MCP и
skill integration. После установки перезапустите Codex.

## 6. Первая задача

Откройте новый Codex chat на любом подключённом компьютере и попросите:

```text
Покажи подключённых агентов и доступные проекты. На другом компьютере открой
проект example, изучи README и верни краткое резюме из двух предложений.
```

Bundled skill выберет агента, прочитает `agent_projects`, вызовет
`agent_start`, дождётся результата через `agent_wait` и вернёт итог. Удалённая
Codex-задача останется видимой на своём host.

Проверьте оба устройства на coordinator host:

```sh
./aopctl.sh device list
```

## 7. Дальше

- [Эксплуатация и backup](../OPERATIONS.ru.md)
- [Update, rollback и uninstall worker](WORKER.ru.md)
- [Модель безопасности и приватности](../security/SECURITY-MODEL.ru.md)
- [Диагностика проблем](../operations/TROUBLESHOOTING.ru.md)
