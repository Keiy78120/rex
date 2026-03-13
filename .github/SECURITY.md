# Security Policy

## Supported Versions

Only the latest release on the `main` branch is actively maintained.

## Reporting a Vulnerability

**Do NOT open a public GitHub issue for security vulnerabilities.**

Report security issues privately by emailing: **rex@dstudio.company**

Include:
- A clear description of the vulnerability
- Steps to reproduce
- Potential impact assessment
- Any suggested fix (optional)

**Response commitment:** You will receive an acknowledgement within **72 hours**. We aim to release a patch within 14 days for confirmed critical issues.

## Scope

### In scope
- `packages/cli` — CLI commands and daemon
- `packages/flutter_app` — macOS desktop application
- `packages/memory` — SQLite memory layer
- Hub API (`hub.ts`) — authentication, token handling
- Gateway (`gateway.ts`) — Telegram bot message handling

### Out of scope
- Vulnerabilities in third-party dependencies (report upstream)
- Issues requiring physical access to the machine
- Theoretical vulnerabilities without a practical exploit path
- Issues in archived or experimental branches

## Security Practices

REX reads credentials from `~/.claude/settings.json` (user-owned, not committed). If you discover that any release accidentally exposed a mechanism to read or exfiltrate this file, that is a critical in-scope issue.
