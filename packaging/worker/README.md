# Agent Operator worker package

This package installs a versioned Agent Operator worker for one macOS or
Windows user. Node.js 24+ and Codex must already be available.

The installer needs the self-hosted coordinator URL, a fresh one-time
enrollment code, and at least one local project path. Run the platform script
from `bin/macos` or `bin/windows`. Use `doctor` after changing Codex or project
configuration. `update` retains configuration and durable state; `rollback`
switches to the previous installed version. `uninstall` always requires an
explicit scope.

See the public repository documentation for exact commands and the supported
platform matrix.
