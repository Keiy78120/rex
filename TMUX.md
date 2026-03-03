# tmux — Guide rapide

Config REX : `~/.tmux.conf` (prefix remappé sur `Ctrl-a`).

## Commandes essentielles

### Lancer / gérer les sessions

```bash
tmux                          # Nouvelle session
tmux new -s work              # Nouvelle session nommée "work"
tmux ls                       # Lister les sessions
tmux attach -t work           # Se rattacher à "work"
tmux kill-session -t work     # Tuer "work"
```

### Raccourcis (prefix = Ctrl-a)

Toujours taper `Ctrl-a` d'abord, puis la touche :

| Raccourci | Action |
|-----------|--------|
| `Ctrl-a d` | Détacher (session continue en arrière-plan) |
| `Ctrl-a c` | Nouvelle fenêtre (window) |
| `Ctrl-a ,` | Renommer la fenêtre courante |
| `Ctrl-a n` / `p` | Fenêtre suivante / précédente |
| `Ctrl-a 1-9` | Aller à la fenêtre N |
| `Ctrl-a \|` | Split horizontal (côte à côte) |
| `Ctrl-a -` | Split vertical (haut/bas) |
| `Alt+flèches` | Naviguer entre les panes (sans prefix) |
| `Ctrl-a x` | Fermer le pane courant |
| `Ctrl-a z` | Zoom/dézoom un pane (plein écran toggle) |
| `Ctrl-a r` | Recharger la config |

### Scroll / copie

```
Ctrl-a [          # Entrer en mode scroll (naviguer avec flèches/PgUp/PgDn)
q                 # Quitter le mode scroll
```

La souris est activée — tu peux scroller avec la molette directement.

## Cas d'usage Claude Code

### Agent Teams (multi-agents en parallèle)

```bash
# Session avec 3 panes pour surveiller les agents
tmux new -s agents
Ctrl-a |          # Split horizontal
Ctrl-a -          # Split vertical dans le pane droit
```

Layout typique :
```
┌──────────────┬──────────────┐
│              │   Agent 1    │
│   Claude     │   (logs)     │
│   Code       ├──────────────┤
│   (main)     │   Agent 2    │
│              │   (logs)     │
└──────────────┴──────────────┘
```

### Session longue

```bash
tmux new -s project-name      # Créer une session nommée
# ... bosser ...
Ctrl-a d                      # Détacher (fermer le terminal, session survit)
# Plus tard :
tmux attach -t project-name   # Reprendre exactement où t'en étais
```

### Monitorer un build

```bash
Ctrl-a |                      # Split
# Pane gauche : Claude Code
# Pane droit : npm run dev (tourne en continu)
Alt+← / Alt+→                # Naviguer entre les deux
```

## Config REX expliquée

| Setting | Valeur | Pourquoi |
|---------|--------|----------|
| `history-limit` | 50000 | Gros scrollback pour les outputs agents |
| `escape-time` | 10ms | Réactivité (défaut tmux = 500ms, trop lent) |
| `mouse` | on | Scroll + clic + resize panes à la souris |
| `monitor-activity` | on | Notifie quand un pane a de l'activité |
| `base-index` | 1 | Fenêtres numérotées 1-9 (pas 0-9) |
| `prefix` | Ctrl-a | Plus ergonomique que Ctrl-b |
