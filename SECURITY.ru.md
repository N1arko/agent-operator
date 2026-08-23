# Политика безопасности

[English version](SECURITY.md)

## Поддерживаемые версии

Security updates получает новейший опубликованный Agent Operator release.
Линия `0.1.x` является private historical baseline. Публичная поддержка
начинается с `0.2.x` alpha после прохождения release gates.

## Сообщить об уязвимости

Используйте [GitHub private vulnerability reporting](https://github.com/N1arko/agent-operator/security/advisories/new).
Укажите affected version, component, условия воспроизведения, impact и
предлагаемое mitigation. Сохраняйте report приватным до исправления или
согласованного disclosure plan.

Исключите device credentials, OpenAI credentials, private prompts, repository
contents и personal data. Предпочтительны redacted logs и минимальный
reproduction repository.

Проект подтверждает report по мере возможности, проверяет affected boundary,
готовит исправление и публикует credit по желанию автора report.

## Security model

Каждый self-hosted deployment образует один trust domain. Registered devices
видят safe presence и опубликованные project descriptors и могут отправлять
друг другу работу. Local source trees, absolute project paths, полный chat list
и OpenAI credentials остаются на worker hosts.

Coordinator хранит mailbox/presence metadata, delivery state и ограниченные
temporary files. Operator отвечает за TLS, host access, backups, device
enrollment и revoke. Shared hosted service для независимых пользователей не
входит в supported alpha model.

Расположение данных, retention, network boundaries и известные alpha risks
описаны в [модели безопасности и приватности](docs/security/SECURITY-MODEL.ru.md).
