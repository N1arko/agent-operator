# Security Policy

## Supported versions

Security updates target the latest published Agent Operator release. The
`0.1.x` line is a private historical baseline. Public support begins with the
`0.2.x` alpha line after its release gates are complete.

## Reporting a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/N1arko/agent-operator/security/advisories/new).
Include the affected version, component, reproduction conditions, impact and
any proposed mitigation. Please keep the report private until a fix or safe
disclosure plan is available.

Do not include device credentials, OpenAI credentials, private prompts,
repository contents or personal data in the report. Redacted logs and minimal
reproduction repositories are preferred.

The project will acknowledge a report on a best-effort basis, validate the
affected boundary, prepare a fix and publish credit when the reporter wants it.

## Security model

Each self-hosted deployment is one trust domain. Registered devices can see
safe presence and published project descriptors and can send work to each
other. Local source trees, absolute project paths, full chat lists and OpenAI
credentials stay on their worker hosts.

The coordinator stores mailbox/presence metadata, delivery state and bounded
temporary files. Operators are responsible for TLS, host access, backups,
device enrollment and revocation. A shared hosted service for unrelated users
is outside the supported alpha model.

See `specs/common/PROP-007-OPEN-SOURCE.md` and
`specs/modules/coordinator/FEAT-007-device-enrollment.md` for the canonical
trust and credential boundaries.
