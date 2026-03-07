# Archive des PRs de Milo — REX

*Sauvegarde du 2026-03-07 — Contenu complet des PRs #4 et #5*

---

## PR #4 — `feat: generalize install paths + per-package CLAUDE.md + design system`

**Branche :** commit `241dd69f`
**Status :** Open (a reviewer)

### Description

- Fix chemins hardcodes dans install.sh (Hammerspoon pointait vers `~/Documents/Developer/_config/rex/`)
- Ajout `check_deps()` pour verifier node, npm, jq avant install
- Merge intelligent settings.json via jq (preserve mcpServers existants)
- Detection OS (macOS/Linux) — skip Hammerspoon + LaunchAgents sur Linux
- Split du CLAUDE.md root (300+ lignes) en `.claude/rules/project.md`, `decisions.md`, `preferences.md`
- Per-package CLAUDE.md pour cli, memory, flutter_app
- FRONTEND.md (design system Flutter)
- docs/PRD-template.md, docs/linux-setup.md
- README aligne (deux chemins d'install documentes)

### Fichiers modifies (12)

| Fichier | Type | Lignes |
|---------|------|--------|
| `.claude/rules/decisions.md` | NOUVEAU | 49 lignes |
| `.claude/rules/preferences.md` | NOUVEAU | 31 lignes |
| `.claude/rules/project.md` | NOUVEAU | 87 lignes |
| `CLAUDE.md` | MODIFIE | +67/-247 (allege) |
| `README.md` | MODIFIE | +16/-2 |
| `docs/PRD-template.md` | NOUVEAU | 40 lignes |
| `docs/linux-setup.md` | NOUVEAU | 90 lignes |
| `install.sh` | MODIFIE | +83/-22 |
| `packages/cli/CLAUDE.md` | NOUVEAU | 13 lignes |
| `packages/flutter_app/CLAUDE.md` | NOUVEAU | 19 lignes |
| `packages/flutter_app/FRONTEND.md` | NOUVEAU | 29 lignes |
| `packages/memory/CLAUDE.md` | NOUVEAU | 12 lignes |

### Contenu cle des nouveaux fichiers

#### .claude/rules/decisions.md (49 lignes)
Decisions techniques prises pendant le dev REX :
- Choix app desktop : Flutter natif, dashboard distant futur seulement si utile via Next.js/React
- SQLite-vec vs ChromaDB (SQLite pour portabilite)
- LaunchAgents vs daemon custom (les deux)
- Two-phase ingest pattern
- Hooks consolidation (4→1 background script)

#### .claude/rules/preferences.md (31 lignes)
Preferences de Kevin :
- Langue francais, pas d'emoji sauf demande
- Stack TS/Node, Flutter, React/Next.js
- Jamais Co-Authored-By
- Commits conventionnels

#### .claude/rules/project.md (87 lignes)
Structure projet, commandes build, points critiques Flutter/Gateway/Memory

#### docs/PRD-template.md (40 lignes)
Template pour les Product Requirements Documents

#### docs/linux-setup.md (90 lignes)
Guide d'installation REX sur Linux/VPS :
- systemd services pour daemon + gateway
- Ollama setup distant
- Pas de Flutter app (headless)

#### packages/flutter_app/FRONTEND.md (29 lignes)
Design system Flutter :
- Theme tokens (accent rouge #E5484D, dark canvas #1C1C24)
- Composants cles (sidebar, tray, pages)
- Contraintes (sandbox off, window_manager)

### Gemini Review Comments (5)

1. **install.sh (security-medium)** : Heredoc non-quote pour Lua — `$REX_DIR` injecte dans string Lua, risque injection
2. **project.md** : Chemin DB incorrect (`~/.rex-memory/` au lieu de `~/.claude/rex/memory/`)
3. **linux-setup.md** : `User=$USER` dans systemd ambigu sous sudo
4. **linux-setup.md** : Meme probleme pour daemon systemd
5. **packages/memory/CLAUDE.md** : Chemin DB incorrect

---

## PR #5 — `feat: project init, multi-account, skills UI + CI/CD`

**Branche :** commit `68567d90`
**Status :** Open (a reviewer)

### Description

- `rex accounts` — multi-compte Claude via `CLAUDE_CONFIG_DIR` (add/list/switch/remove/aliases)
- `rex project init` — one-shot project bootstrap (GitHub repo, branch protection, CI/CD, docs skeleton)
- 4 nouveaux skills : `ui-craft`, `pr-review`, `doc-updater`, `deploy-checklist`
- GitHub Actions dans `dotfiles/.github/` (ci.yml, gemini-review.yml, dependabot.yml, templates PR/issues)
- Router etendu avec 8 nouveaux TaskTypes (simple vs complexe, `requiresClaude()`)
- Rewrite complet de `preload.ts` (detectStack multi-ecosysteme, SKILL_MAP, background GitHub setup)
- `github_setup.ts` — auto-setup .github/ templates + repo creation fire-and-forget

### Fichiers modifies (20)

| Fichier | Type | Lignes |
|---------|------|--------|
| `README.md` | MODIFIE | +71/-4 |
| `dotfiles/.github/ISSUE_TEMPLATE/bug_report.md` | NOUVEAU | 25 lignes |
| `dotfiles/.github/ISSUE_TEMPLATE/feature_request.md` | NOUVEAU | 19 lignes |
| `dotfiles/.github/PULL_REQUEST_TEMPLATE.md` | NOUVEAU | 18 lignes |
| `dotfiles/.github/dependabot.yml` | NOUVEAU | 7 lignes |
| `dotfiles/.github/workflows/ci.yml` | NOUVEAU | 19 lignes |
| `dotfiles/.github/workflows/gemini-review.yml` | NOUVEAU | 25 lignes |
| `dotfiles/skills/deploy-checklist/SKILL.md` | MODIFIE | +39/-40 |
| `dotfiles/skills/doc-updater/SKILL.md` | NOUVEAU | 30 lignes |
| `dotfiles/skills/pr-review/SKILL.md` | NOUVEAU | 36 lignes |
| `dotfiles/skills/project-init/SKILL.md` | MODIFIE | +33/-11 |
| `dotfiles/skills/ui-craft/SKILL.md` | NOUVEAU | 30 lignes |
| `install.sh` | MODIFIE | +1/-1 |
| `packages/cli/src/accounts.ts` | NOUVEAU | 137 lignes |
| `packages/cli/src/github_setup.ts` | NOUVEAU | 224 lignes |
| `packages/cli/src/index.ts` | MODIFIE | +32 |
| `packages/cli/src/paths.ts` | MODIFIE | +1 |
| `packages/cli/src/preload.ts` | MODIFIE | +295/-99 (rewrite) |
| `packages/cli/src/project_init.ts` | NOUVEAU | 340 lignes |
| `packages/cli/src/router.ts` | MODIFIE | +58/-20 |

### Contenu cle des nouveaux fichiers

#### packages/cli/src/accounts.ts (137 lignes)
Multi-compte Claude Code :
- `rex accounts add <name>` — cree un profil Claude isole
- `rex accounts list` — liste tous les comptes
- `rex accounts switch <name>` — bascule via CLAUDE_CONFIG_DIR
- `rex accounts remove <name>` — supprime un profil
- `rex accounts aliases` — genere des shell aliases (claude-work, claude-personal)
- Chaque compte a son propre `~/.claude-<name>/` avec settings, rules, projects

#### packages/cli/src/project_init.ts (340 lignes)
Bootstrap complet de projet :
- Detecte stack (Next.js, React, Flutter, Python, Go, etc.)
- Cree CLAUDE.md adapte au stack
- Init git si absent
- Cree repo GitHub via `gh repo create`
- Configure branch protection (main)
- Copie .github/ templates (CI, review, dependabot)
- Copie skills adaptes au stack
- Cree docs/ skeleton (architecture.md, conventions.md)

#### packages/cli/src/github_setup.ts (224 lignes)
Auto-setup GitHub en background :
- Verifie si .github/ existe deja
- Copie templates depuis dotfiles/
- Cree repo si absent (gh repo create)
- Configure branch protection (require PR, require review)
- Fire-and-forget (ne bloque pas rex init)

#### packages/cli/src/preload.ts (295 lignes rewrite)
Detection multi-ecosysteme :
- Lit package.json, pubspec.yaml, requirements.txt, go.mod, Cargo.toml
- SKILL_MAP : detecte deps → injecte skills correspondants
- Exemples : next → ux-flow + ui-craft, drizzle → db-design, vitest → test-strategy
- Background GitHub setup si .github/ manquant
- Budget 200 tokens pour le preload context

#### packages/cli/src/router.ts (extensions)
8 nouveaux TaskTypes :
- summarize-simple, summarize-complex
- classify-simple, classify-complex
- code-simple, code-complex
- review-simple, review-complex
- `requiresClaude(task)` : true si complex, false si simple → route vers local

#### Skills nouveaux

**ui-craft/SKILL.md** (30 lignes) :
- Design premium : hierarchie visuelle, spacing system, typography scale
- Couleurs intentionnelles, pas de gris generique
- Progressive disclosure, micro-interactions

**pr-review/SKILL.md** (36 lignes) :
- Workflow PR complet : review comments Gemini/Copilot
- Evaluer, fixer, push, notifier
- Template description PR

**doc-updater/SKILL.md** (30 lignes) :
- Mise a jour docs apres changement code
- CLAUDE.md, README, CHANGELOG
- Verifier coherence docs vs code

**deploy-checklist/SKILL.md** (39 lignes) :
- Pre-deploy : tests, lint, build, security
- Deploy gate : CI vert, PR review, changelog
- Post-deploy : monitoring, rollback plan

### Gemini Review Comments (6) — SECURITY ISSUES

1. **accounts.ts (SECURITY-HIGH)** : `addAccount`/`switchAccount`/`generateAliases` emettent du shell sans sanitisation. Nom malveillant `"; rm -rf /; "` → injection commandes via eval. **A FIXER.**
2. **accounts.ts (security-medium)** : Path traversal possible avec nom `../../.ssh`. **A FIXER.**
3. **project_init.ts (security-medium)** : `projectName` de `cwd.split('/').pop()` utilise dans execSync — injection si nom de repertoire malveillant. **A FIXER.**
4. **gemini-review.yml (security-medium)** : `github.base_ref` dans shell run — injection via nom de branche. **A FIXER.**
5. **deploy-checklist/SKILL.md** : Inconsistance de langue (anglais/francais melange).
6. **project-init/SKILL.md** : `enforce_admins=true` dans skill vs `false` dans code.

---

## Diffs complets

Les diffs bruts complets sont sauvegardes dans :
- PR #4 diff : `~/.claude/projects/-Users-keiy/.../bmebkr1at.txt` (41.4 KB)
- PR #5 diff partie 1 : `~/.claude/projects/-Users-keiy/.../be3gszt88.txt` (67.5 KB)
- PR #5 diff partie 2 : `~/.claude/projects/-Users-keiy/.../toolu_015Yy9nMd3yssjKkucBGepyP.txt` (78.2 KB)
- PR #5 inline comments : `~/.claude/projects/-Users-keiy/.../bnskump89.txt` (34.3 KB)

---

## Ce qui est reutilisable pour REX v7

### A integrer (bon code, bonne idee)
- `accounts.ts` — multi-compte Claude (apres fix security)
- `project_init.ts` — bootstrap projet (apres fix security)
- `github_setup.ts` — auto-setup GitHub templates
- `preload.ts` rewrite — SKILL_MAP detection multi-ecosysteme
- `router.ts` extensions — simple vs complex routing
- Skills : ui-craft, pr-review, doc-updater, deploy-checklist
- GitHub Actions templates (ci.yml, gemini-review.yml, dependabot.yml)
- Per-package CLAUDE.md pattern
- docs/linux-setup.md — base pour Docker/VPS setup
- docs/PRD-template.md

### A corriger avant merge
- **4 failles security** dans accounts.ts, project_init.ts, gemini-review.yml (injection commandes)
- Chemins DB incorrects (encore `~/.rex-memory/`)
- install.sh Lua heredoc injection
- Inconsistances langue dans skills

### Deja fait en v6 (doublon)
- Split CLAUDE.md → deja fait manuellement (mais la version Milo est plus propre)
- preload.ts → deja rewrite en v6 (la version Milo ajoute SKILL_MAP, a merger)
- router.ts → deja etendu en v6 (la version Milo ajoute simple/complex, a merger)
