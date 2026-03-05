---
name: context-loader
description: Load relevant documentation and project context before starting work. Reads local docs cache, project CLAUDE.md, and REX memory. Use at session start or project switch.
---

# Context Loader

Load context for: $ARGUMENTS (project path or framework name)

## If project path given:
1. Read project's `CLAUDE.md` if exists
2. Read `package.json` / `composer.json` / `pubspec.yaml` to detect stack
3. Call `rex_context(project_path)` for past session insights
4. For each framework detected, read `~/.claude/docs/{framework}.md` if exists
5. Report: stack detected, relevant docs loaded, past context found

## If framework name given:
1. Check `~/.claude/docs/{framework}.md` — if exists, read it
2. If not exists, fetch via Context7 and save key patterns to `~/.claude/docs/{framework}.md`
3. Report: doc loaded/created, key patterns summarized

## Rules
- NEVER load docs that aren't relevant to the current task
- Always check local cache before fetching from network
- Keep doc files under 100 lines — patterns and gotchas only, not full API reference
