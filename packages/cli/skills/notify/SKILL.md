---
name: notify
description: Send a Telegram notification to Kevin. Use when user says "/notify", "notify me", "send telegram", or at end of important tasks. Arguments become the message body.
user_invocable: true
---

# Notify via Telegram

Send a notification to Kevin's Telegram using the notify script. Zero tokens — pure shell.

## Usage

```bash
bash ~/notify-telegram.sh "$ARGUMENTS"
```

If `$ARGUMENTS` is empty, auto-generate a one-line summary of what was just accomplished:
- Project name + branch
- What changed (brief)

Example:
```bash
bash ~/notify-telegram.sh "PR #42 created on rex" "feat/v3 — 33 files, 1800+ lines"
```

IMPORTANT: This is a shell script call, NOT an LLM task. Do not elaborate. Just call the script.
