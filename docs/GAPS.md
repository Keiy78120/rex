
---

# REX — GAPS & INCOHÉRENCES (09/03/2026)
> Ce qu'on n'a pas vu, les contradictions, les trous dans l'architecture.
> À résoudre avant la mise en prod.

---

## INCOHÉRENCES DÉTECTÉES

### 1. gateway.ts vs rex-identity.ts — Duplication ?
**Problème :** `gateway.ts` existe + `rex-identity.ts` existe (375 lignes).
Lequel est le vrai entry point ? Sont-ils câblés ensemble ?
**Fix :** Vérifier que `gateway.ts` appelle `rex-identity.ts`.
Si deux logiques séparées → merger ou documenter la séparation.

### 2. relay-engine.ts — câblé dans quoi ?
**Problème :** `relay-engine.ts` existe mais est-ce qu'il est appelé depuis `gateway.ts` ou `orchestrator.ts` ?
**Fix :** Vérifier l'import dans orchestrator.ts + gateway.ts.

### 3. user-cycles.ts vs user-state.ts — Doublon ?
**Problème :** Deux fichiers pour la gestion d'état utilisateur.
**Fix :** Fusionner ou clarifier : user-state = primitive, user-cycles = XState machine.

### 4. activitywatch-bridge.ts — Jamais appelé ?
**Problème :** Le fichier existe mais rien ne l'appelle dans les logs commits.
**Fix :** Brancher dans user-cycles.ts pour le sleepScore.

### 5. agent-templates vs client-factory.ts — Overlap ?
**Problème :** `agent-templates/` (personas DG/DRH) + `client-factory.ts` semblent faire la même chose.
**Fix :** client-factory crée les containers Docker, agent-templates définit les personas → OK si séparés. Vérifier.

### 6. CLAUDE_TASK.md — Tâches déjà faites non cochées
**Problème :** relay-engine.ts, watchdog.ts, sandbox/ sont déjà implémentés mais le TODO.md dit non.
**Fix :** Claude Code doit mettre à jour TODO.md + CLAUDE_TASK.md avec l'état réel.

### 7. scripts/ directory — Absent du repo
**Problème :** On a documenté un script store complet mais le répertoire `scripts/` n'existe que comme `build-binary.sh` etc.
**Fix :** Créer `rex/scripts/` avec les shell scripts opérationnels.

### 8. mini-modes/ — Documenté mais pas créé
**Problème :** `packages/cli/src/mini-modes/` n'existe pas encore.
**Fix :** Claude Code doit créer ce répertoire avec les premiers modes (search, save, status).

---

## TROUS DANS L'ARCHITECTURE (choses non pensées)

### A. Comment REX reçoit les messages Telegram en production ?
**Gap :** On a gateway.ts mais comment est-ce que le bot Telegram est configuré pour pointer vers REX ?
Actuellement REX utilise OpenClaw comme gateway. Quand REX tourne en standalone, il faut son propre bot Telegram.
**Fix :** Documenter dans UX.md : "rex setup" configure le bot Telegram.
Fichier à créer : `telegram-gateway.ts` standalone (sans OpenClaw).

### B. Authentification entre BRAIN et FLEET nodes
**Gap :** Comment un FLEET node prouve son identité au BRAIN ?
**Fix :** JWT token généré au `rex fleet:join`, stocké dans `~/.rex/fleet-token`.
Renouvellement automatique toutes les 24h.

### C. Que se passe-t-il si le BRAIN VPS est down ?
**Gap :** Pas de fallback documenté. L'user ne peut plus rien faire.
**Fix :** Mode dégradé local : FLEET node (Mac) peut répondre aux intents simples en offline.
Documenter dans `REX-LOGIC.md` section "offline mode".

### D. Versioning du format de mémoire
**Gap :** Si on change le schema SQLite en v2, les vieilles données sont perdues.
**Fix :** `db-migrations.ts` existe déjà (vu dans les commits) → vérifier qu'il est branché au démarrage.

### E. Rate limiting des scripts web
**Gap :** Si CURIOUS scanne trop vite les sources OSS → IP ban.
**Fix :** Ajouter délais entre requêtes dans `curious.ts`. Respecter `robots.txt`. Cacher les résultats 24h minimum.

### F. Secrets chiffrés — mais la clé de chiffrement est où ?
**Gap :** `secrets.ts` avec AES-256-GCM existe, mais la master key est stockée comment ?
**Fix :** Dériver depuis un password maître (argon2) + stockée dans le keychain OS (Keychain Mac / libsecret Linux).

### G. Multi-langue — REX parle français mais l'user peut switcher
**Gap :** Si l'utilisateur écrit en anglais, REX répond en quoi ?
**Fix :** Détecter la langue du message entrant (mini-model ou simple regex). Répondre dans la même langue.

### H. Limite de taille des messages Telegram
**Gap :** Telegram = max 4096 chars. Si REX génère une longue réponse → erreur silencieuse.
**Fix :** Dans `gateway-adapter.ts` → splitter automatiquement les réponses > 4000 chars.
OpenClaw le fait déjà (textChunkLimit: 4000) mais REX standalone non.

### I. Gestion des pièces jointes Telegram
**Gap :** Si l'user envoie une image ou un audio → REX ne sait pas quoi faire.
**Fix :** Audio → pipe vers `audio-logger.ts` (Whisper). Image → Ollama vision si disponible, sinon notify "image reçue, traitement non disponible".

### J. Cold start VPS (premier démarrage)
**Gap :** Sur un VPS vierge, quelle est la séquence exacte d'installation ?
**Fix :** `install-linux.sh` existe → vérifier qu'il installe : Node 22, pnpm, Ollama, nomic-embed, PM2, rex npm package.

### K. Monitoring des coûts en temps réel
**Gap :** Le budget tracker existe mais est-ce qu'il y a une alerte quand on approche du daily_limit ?
**Fix :** `budget.ts` → ajouter alerte à 80% du daily_limit via Telegram.

### L. REX CURIOUS — sources RSS pas encore fetchées
**Gap :** On a documenté les sources (Simon Willison, HuggingFace, r/LocalLLaMA) mais aucun cron ne les fetch.
**Fix :** Cron nocturne dans `daemon.ts` → `curious-scanner.ts` (à créer ou vérifier s'il existe).

---

## ACTIONS POUR CLAUDE CODE (priorité correctrice)

```
1. Vérifier câblage gateway.ts → rex-identity.ts → orchestrator → relay-engine
2. Fusionner user-cycles.ts + user-state.ts si doublon
3. Brancher activitywatch-bridge.ts dans user-cycles.ts (sleepScore)
4. Créer scripts/ directory avec les shell scripts (copier depuis /tmp/rex_scripts_store.sh)
5. Créer packages/cli/src/mini-modes/ avec 3 premiers modes (search-memory, save-idea, status)
6. Mettre à jour TODO.md avec l'état réel (cocher ce qui est fait)
7. Créer curious-scanner.ts si pas encore là (cron nocturne sources RSS/OSS)
8. Vérifier db-migrations.ts branché au boot
9. Ajouter split 4000 chars dans gateway-adapter.ts
10. Ajouter alerte 80% daily_limit dans budget.ts
```

---

## QUESTIONS À TRANCHER (décisions Kevin)

1. **Telegram standalone** : quand REX sera indépendant d'OpenClaw, il faut son propre bot → créer maintenant ou attendre ?
2. **Fleet auth JWT** : implémenter maintenant ou attendre le split BRAIN/FLEET ?
3. **Offline mode** : fallback Mac si VPS down → dans scope v1 ou v2 ?
4. **Multi-langue** : détecter et répondre dans la langue de l'user → v1 ou v2 ?
