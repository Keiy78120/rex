---
name: token-guard
description: Optimize context usage. Audit what's loaded, suggest cleanup, compact if needed. Use when context feels bloated or before long sessions.
---

# Token Guard

Audit and optimize the current context usage.

## Checks
1. **Files in context**: list all files that have been read this session
2. **Redundant reads**: flag files read multiple times
3. **Large outputs**: flag tool results > 200 lines that could have been scoped
4. **Stale context**: flag information from early in session that's no longer relevant

## Actions
- Suggest `/compact` if context > 70%
- Suggest `/clear` if switching to unrelated task
- Identify docs/files that could be read on-demand instead of upfront
- Flag any MCP server responses that returned excessive data

## Reminders
- Use subagents for heavy research (keeps main context clean)
- Use `limit` and `offset` when reading large files
- Use `head_limit` on Grep results
- Prefer Glob/Grep over Agent for simple lookups
