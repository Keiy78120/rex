# Garry → REX : Guide de migration mémoire et outils

> Garry (openclaw-bot) sera remplacé par REX quand celui-ci est pleinement opérationnel.
> Ce guide explique comment migrer sa mémoire, ses outils et ses configurations.

---

## 1. Ce que Garry a et que REX doit absorber

| Élément | Garry | REX équivalent |
|---------|-------|----------------|
| Mémoire sessions | `~/.claude/projects/*/` JSONL | `rex ingest` → memory DB |
| Runbooks | Markdown dans notes | `rex observe` → observations |
| Guards actifs | `.claude/settings.json` | `rex init` + guards directory |
| MCPs configurés | `~/.claude/settings.json` mcpServers | `rex mcp list` + `rex mcp import-claude` |
| Skills | `~/.claude/skills/` | `rex skills list` (déjà synchronisés) |
| Config modèles | CCR config | `rex models` + router.ts |
| Gateway | openclaw-bot | `rex gateway` (même bot Telegram ou nouveau) |
| Context projet | Per-project CLAUDE.md | `rex context` + preload |

---

## 2. Migration mémoire sessions Claude Code

### Étape 1 — Ingérer toutes les sessions existantes de Garry

Si Garry tourne sur une autre machine (VPS ou autre Mac), SSH dessus et :

```bash
# Sur la machine Garry
# Trouver les projets Claude Code
ls ~/.claude/projects/

# Copier les sessions vers la machine REX (via Tailscale ou rsync)
rsync -avz ~/.claude/projects/ keiy@<REX_MAC_IP>:~/.claude/projects/
# ou via Tailscale :
rsync -avz ~/.claude/projects/ keiy@100.x.x.x:~/.claude/projects/
```

### Étape 2 — Ingérer sur REX

```bash
# Sur la machine REX (Mac ou VPS)
rex ingest --all           # Ingère toutes les sessions
rex categorize --batch=200 # Catégorise en lot
rex memory-check --json    # Vérifie l'état

# Résultat attendu : >X memories, 0 pending
```

---

## 3. Migration des runbooks et notes Garry

### Si Garry a des notes Markdown

```bash
# Copier les notes dans le dossier d'ingestion REX
rsync -avz ~/.garry/notes/ ~/.claude/projects/_garry-notes/

# Créer un JSONL factice pour l'ingest
# (ou créer manuellement des observations)
rex observe "Garry runbook: [contenu]" --type=runbook
```

### Si Garry a un format spécifique

REX peut ingérer directement via la commande iMessage-style :

```bash
# Pour chaque note importante
rex observe "<contenu>" --type=lesson
rex observe "<solution trouvée>" --type=runbook
rex observe "<pattern détecté>" --type=observation
```

---

## 4. Migration des MCPs Garry → REX

```bash
# Sur la machine Garry, exporter la config MCP
cat ~/.claude/settings.json | jq '.mcpServers'

# Sur REX, importer depuis Claude Code settings
rex mcp import-claude

# Vérifier
rex mcp list
```

---

## 5. Migration des guards

```bash
# Comparer les guards actifs
# Garry :
cat ~/.claude/settings.json | jq '.hooks'

# REX installe ses propres guards (superset de Garry)
rex init  # réinstalle et met à jour tous les guards

# Vérifier
rex guard list
```

---

## 6. Migration Gateway Telegram

Si Garry et REX partagent le même bot Telegram :
1. Arrêter le gateway Garry : `pkill -f "garry.*gateway"` ou équivalent
2. Démarrer REX gateway : `rex gateway`
3. Même `REX_TELEGRAM_BOT_TOKEN` et `REX_TELEGRAM_CHAT_ID`

Si bots séparés :
- REX crée un nouveau bot via `@BotFather`
- Configurer dans `~/.claude/settings.json`

---

## 7. Checklist migration complète

```
[ ] Sessions Garry copiées sur machine REX
[ ] rex ingest --all exécuté (0 pending)
[ ] rex categorize --batch=200 exécuté
[ ] rex memory-check → ≥ même nombre memories qu'avant
[ ] MCPs importés via rex mcp import-claude
[ ] rex mcp list → même liste que Garry
[ ] Guards réinstallés via rex init
[ ] Gateway Telegram redirigé vers REX
[ ] rex doctor → tout vert
[ ] Garry désactivé (LaunchAgent/systemd stoppé)
[ ] rex status → tout opérationnel
```

---

## 8. Test de validation post-migration

```bash
# 1. Recherche mémoire : doit retrouver des sessions Garry
rex search "une décision prise avec Garry"

# 2. Hybrid search
rex search "bug récurrent" --hybrid

# 3. Gateway fonctionnel
# Envoyer un message Telegram → REX répond

# 4. Memory check complet
rex memory-check --json | jq '.'

# 5. Doctor final
rex doctor
```

---

## 9. Désactivation propre de Garry

Une fois la migration validée :

```bash
# macOS LaunchAgent
launchctl unload ~/Library/LaunchAgents/com.openclaw.garry-*.plist
rm ~/Library/LaunchAgents/com.openclaw.garry-*.plist

# Linux systemd
systemctl stop garry-daemon garry-gateway
systemctl disable garry-daemon garry-gateway

# Garder les fichiers en archive (ne pas supprimer)
mv ~/.garry ~/.garry-archive-$(date +%Y%m%d)
```

---

## 10. Notes importantes

- **Ne jamais supprimer les sessions Garry avant validation** — elles sont la source de vérité
- **La mémoire REX est additive** — ingérer Garry ne supprime pas les mémoires existantes
- **Garder Garry en mode lecture seule** pendant la migration (désactiver l'écriture, garder les logs)
- **VPS brain** : si Garry tournait sur VPS, installer REX dessus AVANT de migrer (voir `docs/vps-install.md`)
