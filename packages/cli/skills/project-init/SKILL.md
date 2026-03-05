---
name: project-init
description: Initialize a new project with CLAUDE.md, proper git setup, and documentation cache. Use when starting a new project or onboarding an existing one.
---

# Project Init

Initialize project: $ARGUMENTS (path or name)

## For new projects
1. Create project directory structure
2. Generate `CLAUDE.md` with project-specific instructions
3. Detect stack from user input, create appropriate config files
4. Load relevant docs from `~/.claude/docs/` or fetch via Context7
5. Git init, create `.gitignore`, initial commit
6. Save project context: `rex_learn("Project X uses stack Y, structure Z", "architecture")`

## For existing projects (onboarding)
1. Read existing `package.json` / `composer.json` / config files to detect stack
2. Read existing `CLAUDE.md` if present, or create one
3. Scan project structure: key directories, entry points, routing
4. Load relevant framework docs from `~/.claude/docs/`
5. Call `rex_context(project_path)` for any past work history
6. Report: stack, structure, key files, any issues noticed

## CLAUDE.md template
```markdown
# Project Name

## Stack
- Framework: ...
- Language: ...
- Database: ...

## Commands
- Dev: `npm run dev`
- Build: `npm run build`
- Test: `npm test`
- Lint: `npm run lint`

## Key Files
- Entry: ...
- Config: ...
- Routes: ...
```
