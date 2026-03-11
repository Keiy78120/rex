# REX × Claude Code — Integration Design
## Document (2026-03-11)

> Découverte clé : Claude Code a déjà implémenté nativement la majorité
> de ce que REX voulait construire from scratch.
> On n'adapte pas, on se branche dessus.

---

## 1. Hooks Claude Code → REX Guards natifs

Les 8 guards REX deviennent des hooks Claude Code.
Plus de duplication — on utilise le système natif.

### Events disponibles

| Hook event | Utilisation REX |
|-----------|----------------|
| `SessionStart` | Boot memory ingest (MEMORY.md + observations YAML) |
| `UserPromptSubmit` | Intent classifier — USER_INTENT avant que Claude voit le message |
| `PreToolUse` | Budget check + security scan avant chaque tool call |
| `PostToolUse` | Log dans event journal + living cache (résultat → script) |
| `PostToolUseFailure` | Log échec + retry strategy |
| `Stop` | Scorer le living script, stocker résultat dans cache sémantique |
| `SubagentStart` | Monitor spawn relay pane |
| `SubagentStop` | Récupérer résultat pane, mettre à jour SHARED.md |
| `InstructionsLoaded` | Réinjecter contexte REX quand CLAUDE.md est chargé |
| `TeammateIdle` | Détecter idle dans agent team → assigner tâche suivante |

### Structure fichiers hooks REX

```
.claude/
  hooks/
    session-start.sh       ← ingest memory au boot
    user-prompt-submit.sh  ← intent classifier
    pre-tool-use.sh        ← budget check
    post-tool-use.sh       ← event journal + cache
    stop.sh                ← score scripts + cache store
```

### Exemple hook PreToolUse (budget check)

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [{
          "type": "command",
          "command": "rex budget-check --tool $TOOL_NAME"
        }]
      }
    ]
  }
}
```

### Exemple hook UserPromptSubmit (intent classifier)

```json
{
  "hooks": {
    "UserPromptSubmit": [{
      "type": "command",
      "command": "rex ingest \"$PROMPT\" --source user --hook-mode"
    }]
  }
}
```

`--hook-mode` : si CACHE HIT → inject résultat dans context, skip LLM.

---

## 2. Subagents Claude Code → Relay Panes

Les panes relay (Planner/Coder/Reviewer) deviennent des subagents natifs.
Plus besoin de sessions_spawn OpenClaw ou TMUX.

### Fichiers à créer

```
.claude/agents/
  rex-planner.md     ← Haiku, read-only, plan + décomposition
  rex-coder.md       ← Sonnet, write access, implémentation
  rex-reviewer.md    ← Haiku, read-only, code review + sécurité
  rex-researcher.md  ← Haiku, read-only, web search + docs fetch
  rex-memory.md      ← Haiku, read-only, query living cache + MEMORY.md
```

### Format subagent (frontmatter YAML)

```yaml
---
description: REX Planner — analyse la tâche, décompose en étapes, estime confidence
model: claude-haiku-4-5
tools: [Read, Grep, Bash]
disallowedTools: [Write, Edit]
permissionMode: default
hooks:
  Stop:
    - type: command
      command: rex relay-done --pane planner --confidence $CONFIDENCE
---

Tu es le PLANNER de REX.
Ta mission : analyser la tâche, produire un plan structuré.
Format de réponse JSON : { plan, confidence, resources_needed, pass_to_next }
Si confidence >= 0.85 : conclure. Sinon : passer au Coder.
```

### Commande anti-vibe avec subagents

```bash
# Avant (sessions_spawn custom) :
rex anti-vibe "task" → pane-relay.ts → sessions_spawn × 3

# Après (subagents natifs) :
claude "task" --agents '[
  {"name": "Planner", "model": "haiku"},
  {"name": "Coder", "model": "sonnet"},
  {"name": "Reviewer", "model": "haiku"}
]'

# Ou via CLI REX (wrappé) :
rex anti-vibe "task" → claude --agents rex-planner,rex-coder,rex-reviewer
```

---

## 3. Agent Teams → rex anti-vibe en mode natif

Anthropic a implémenté le relay multi-agent nativement (experimental).

**Différence avec subagents :**
- Subagents → rapportent au main agent seulement
- Agent Teams → communication directe entre agents (exactement le relay REX)

**Activation :**
```bash
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=true
```

**Usage pour rex anti-vibe :**
```
Lead: REX Orchestrator
  ├── Teammate 1: Planner (explore + plan)
  ├── Teammate 2: Coder (implement)
  └── Teammate 3: Reviewer (review + validate)

→ Teammates communiquent directement via task list partagée
→ Lead synthétise quand tous idle (TeammateIdle hook)
```

**Best cases** (selon docs Anthropic) :
- Modules/features indépendants → parfait pour REX relay
- Debug avec hypothèses parallèles → reviewer en parallèle du coder
- Cross-layer (frontend + backend + tests) → chaque teammate owns sa layer

---

## 4. Preprocessing Hooks → Token Reduction -70%

Avant de passer un fichier/log à Claude, un hook filtre le contenu.
Le LLM reçoit seulement ce qui est pertinent.

**Exemples REX :**

```bash
# Hook PostToolUse sur Bash :
# Si output > 5000 chars → grep les erreurs/warnings seulement
if [ ${#OUTPUT} -gt 5000 ]; then
  echo "$OUTPUT" | grep -E "(ERROR|WARN|FAIL|exception)" | head -50
else
  echo "$OUTPUT"
fi

# Hook PreToolUse sur Read :
# Si fichier > 200 lignes → extraire seulement la fonction demandée
rex extract-scope "$FILE_PATH" "$QUERY" --max-tokens 2000
```

---

## 5. vexp → Dependency Graph (-65% tokens)

Tool communautaire (pas officiel Anthropic) : [vexp.dev](https://vexp.dev)
Extension VS Code, Rust, 100% local, SQLite, zéro cloud.

**Ce qu'il fait :**
- Build un AST dependency graph via tree-sitter
- Quand Claude demande du contexte → reçoit 2 400 tokens (fonction + deps directes) au lieu de 18 000
- Session memory : lie les observations aux nodes du graph, détecte si le code a changé

**Pour REX :**
- Court terme : installer sur Mac → Claude Code sur REX brûle -65% tokens immédiatement
- Moyen terme : intégrer le concept dans `rex code` CLI via tree-sitter Node

**Concept à intégrer dans intent-engine.ts :**
```
intent: CODE_TASK → rex code "fix burn-rate.ts"
  → tree-sitter: extraire burn-rate.ts + imports directs
  → ~2k tokens au lieu de lire tout le repo
  → résultat → living script pour la prochaine fois
```

---

## 6. Checkpointing → Snapshots REX

Claude Code a un système de checkpoints natif.
REX hook `rex-snapshot` devient superflu — utiliser le système natif.

**Intégration :**
- `checkpoint.before` → déclenché par hook PreToolUse si action CRITICAL
- Rewind via `/checkpoint restore` si un fix REX casse quelque chose

---

## Priorités d'implémentation

| Priorité | Feature | Effort | Impact |
|----------|---------|--------|--------|
| 🔴 P0 | Hooks UserPromptSubmit → intent classifier | Faible | Énorme (0 token si cache hit) |
| 🔴 P0 | Hooks PreToolUse → budget check | Faible | Important |
| 🟠 P1 | Subagents .claude/agents/ (5 fichiers) | Moyen | Remplace pane-relay.ts |
| 🟠 P1 | vexp install sur Mac | Très faible | -65% tokens immédiat |
| 🟡 P2 | Agent Teams (experimental) | Moyen | rex anti-vibe natif |
| 🟡 P2 | Preprocessing hooks sur Bash/Read | Faible | -50% tokens sur gros fichiers |
| 🟢 P3 | tree-sitter dans intent-engine.ts | Élevé | CODE_TASK optimal |

---

## Fichiers à créer sur Mac (Claude Code)

```
rex/
  .claude/
    agents/
      rex-planner.md
      rex-coder.md
      rex-reviewer.md
      rex-researcher.md
      rex-memory.md
    hooks/
      session-start.sh
      user-prompt-submit.sh
      pre-tool-use.sh
      post-tool-use.sh
      stop.sh
    settings.json   ← hook bindings + CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS
```

**Source VPS :** `/home/node/.openclaw/workspace/memory/rex_claude_code_integration.md`
À syncser sur Mac quand disponible.
