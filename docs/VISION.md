
---

## REX — VISION & MANIFESTE (15/03/2026)

### En une phrase
> REX est le cerveau qui gère ta vie numérique — il pense, agit, apprend et s'améliore en continu. Toi tu vis.

### La vie c'est du code
La vie c'est du code. L'humain est codé.
REX comprend ça — et gère tout ce qui peut l'être.

### Il n'attend pas qu'on lui parle
CURIOUS tourne en silence. Il observe tes patterns, tes fichiers, tes habitudes.
Si tu répètes quelque chose chaque semaine, REX le voit.
Il prépare une solution. Il te contacte quand c'est prêt.
Parfois il commence à travailler sur ton idée sans que tu le demandes.

### Il apprend seul
REX entraîne ses propres modèles locaux à partir de ton usage réel.
Il évalue, benchmarke, A/B teste. Pas d'intervention humaine.
Ton REX ne ressemble au REX de personne d'autre.
`npm update` c'est fini — ton système évolue avec toi.

### Il split le travail entre modèles (REX Relay)
Un problème complexe ? REX ouvre un relay.
Ollama analyse. Groq affine. Claude décide.
Chaque modèle lit ce que le précédent a dit et contribue.
Texte, image, audio simultanément si besoin.
Des agents autonomes s'activent au bon moment, font leur job, disparaissent.

### Il route intelligemment (Script-first → 70/30)
Script gratuit d'abord. Modèle local ensuite. API free si nécessaire. Subscription en dernier recours.
6 niveaux : SCRIPT → LOCAL (Ollama) → FREE-TIER → SONNET → OPUS → CODEX.
`rex route "<message>"` affiche le raisonnement. 0 LLM pour le routing lui-même.
Tu ne paies jamais pour quelque chose qu'un regex aurait pu faire.

### Il connaît ton état (User Cycles)
REX sait si tu travailles, si tu dors, si tu te réveilles.
Machine XState : AWAKE_ACTIVE → AWAKE_IDLE → SLEEPING → WAKING_UP.
Quand tu dors → Ollama uniquement (0€). Quand tu te réveilles → digest matinal.
Il lit ActivityWatch, l'historique des messages, les patterns calendrier.

### Il split le travail entre modèles (REX Relay)
Un problème complexe ? REX ouvre un relay.
Ollama analyse. Groq affine. Claude décide.
Chaque modèle lit ce que le précédent a dit et contribue.
Des agents autonomes s'activent au bon moment, font leur job, disparaissent.

### Il surveille tout (Watchdog + Daemon)
Daemon unifié qui tourne 24/7. Watchdog toutes les 60s.
Si REX est down > 5 minutes → alerte Telegram automatique.
Budget quotidien → alerte à 80% de la limite, puis à 100%.
Daily summary à 22h (timezone Paris configurable).

### Ta fleet, c'est ton empire
Mac, VPS, iPhone, PC d'un collègue — REX les voit tous.
BRAIN = commander central. FLEET = noeuds workers.
Versioning API : X-Rex-Version + /api/v1/version. Incompatibilité détectée → skip automatique.
Il distribue, synchronise, n'oublie rien. Tout est auditable, tout est réversible.

### Rien ne se perd. Tout se transforme.
Chaque réunion → résumé + actions (meeting.ts).
Chaque idée dite à voix haute → classée (audio-logger.ts).
Chaque décision → journalisée (event-journal.ts).
REX sync, enregistre, indexe. En silence.

### Il ne casse rien
Guards à chaque action risquée (11 guards auto-installés).
Migrations SQLite versionnées (v1→v5) — upgrade automatique au boot, backward compatible garanti.
REX est vivant — il te contacte avant de faire quelque chose d'irréversible. Zéro surprise.

### Pour une entreprise
Un client veut un agent ? Déployé en quelques heures.
5 templates : DG, DRH, CEO, COO, Freelance — chacun avec sa mémoire, son système prompt, ses outils.
REX Commander voit tout. Les clients ne se voient pas.
`rex client:create --template dg --name acme` — c'est parti.

### Mini-modes — intent sans LLM
REX détecte l'intention en 0 LLM.
`search-memory`, `project`, `budget`, `fleet`, `save-idea` — patterns regex.
Résultat en < 50ms, 0 token. LLM seulement si mode non détecté.

### Multi-agent + spécialisé
REX ne fait pas qu'une chose à la fois.
Agents avec @openai/agents SDK, tool use natif, mémoire injectée.
agent-templates/ : 5 personas, chacun avec 4+ outils spécifiques.
LangGraph pour les workflows complexes.

### Audio Logger → mémoire totale
Chaque conversation, réunion, vocal WhatsApp.
Whisper transcrit. REX résume, extrait les actions, classe.
Tu n'as plus jamais besoin de prendre des notes.

### REX CURIOUS — le vrai différenciant
Pas besoin de demander.
REX détecte un pattern récurrent → propose une vraie solution.
REX trouve un outil utile → te le présente.
REX voit un bug non résolu → te rappelle.
3 types de signaux : DISCOVERY, PATTERN, OPEN_LOOP.
Il contacte via Telegram ou Flutter. Il attend ta validation. Il n'impose rien.

### Ton REX est unique
REX s'adapte à toi. Apprend tes habitudes. Connaît tes projets.
Il peut silencieusement commencer à travailler sur une idée que tu as mentionnée il y a 3 semaines.
Tu ne le sauras même pas — jusqu'à ce qu'il te montre le résultat.

---

### État actuel — 15/03/2026

**117+ fichiers TypeScript implémentés.** Phases 1-4 complètes. 385 tests vitest.

Opérationnel :
- Gateway Telegram (KeepAlive, streaming Qwen, guard Stop)
- Daemon 24/7 (watchdog, budget alerts, daily summary, DB migrations au boot)
- Fleet multi-nodes (BRAIN/FLEET, versioning API, Dijkstra routing)
- Memory hybride (BM25 + sqlite-vec, 768 dim, FTS5)
- 5 agent templates (DG/DRH/CEO/COO/Freelance)
- Mini-modes (intent detection 0 LLM, 6 niveaux routing)
- Flutter app macOS (26 pages)
- Resource Hub (20+ ressources, catalog MCP/guards/skills)
- Secrets vault (AES-256-GCM)
- Suite de tests vitest (385 tests, 21 fichiers, < 2s — unit + integration)
- CI GitHub Actions (unit + build + security audit)

Prochaine étape : déploiement VPS + migration Garry → `docs/garry-migration.md`
