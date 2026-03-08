# REX — Agent Factory B2B

*Document de vision et d'architecture — 2026-03-08*
*Recherche basee sur 5 agents Haiku : pain points artisans, OSS stack, fine-tuning, pricing, provider routing*

---

## Vision

REX devient une **fabrique d'agents metier** pour des clients B2B (artisans, PME).
Kevin les cree, deploie, monitore et maintient via REX.
Chaque client a son propre agent isole, entraine sur son metier, accessible 24/7.

REX reste le createur, l'installateur, l'orchestrateur et le moniteur. Les agents client sont des produits REX, pas des instances REX.

---

## Pourquoi les artisans en France

### Chiffres CAPEB 2025 (3029 repondants)

| Indicateur | Chiffre |
|------------|---------|
| Heures perdues/semaine en admin | **6-8h** (une journee entiere) |
| Artisans stresses par l'administratif | **41%** |
| Artisans travaillant >60h/semaine | **19%** |
| Litiges chantiers lies a la communication | **80%** |
| Artisans sans suivi post-chantier | **60%** |
| Gain potentiel numerisation | -35% temps devis, +4h/sem |

Aucun logiciel existant (Batappli, Obat, Henrri, MyExtrabat) n'a d'IA native. C'est la fenetre d'opportunite.

### Top pain points par corps de metier

| Metier | Pain points specifiques IA-ready |
|--------|----------------------------------|
| **Plombier/chauffagiste** | SAV urgences, astreintes, pieces vehicule, dossiers CEE |
| **Electricien** | Attestations CONSUEL, schemas, DICT |
| **Peintre** | Quantitatifs surfaces, gestion coloris par chantier |
| **Maçon** | BL beton en temps reel, plans |
| **Couvreur** | Chiffrages pente/surface, drone devis |
| **Menuisier** | Carnets cotes, commandes usine, suivi pose |
| **Chauffagiste** | Dossiers MaPrimeRenov/CEE, certificats RGE |

### Ce qu'on automatise — Priorite demo

| Priorite | Tache | Valeur client | Complexite |
|----------|-------|---------------|------------|
| 🔴 #1 | Bot vocal appels manques | Chantiers perdus recuperes | Moyenne |
| 🔴 #2 | Relances clients impayés + rappels RDV | Impayés, no-shows | Faible |
| 🔴 #3 | Dossiers MaPrimeRenov/CEE | 3-4h par dossier economisees | Moyenne |
| 🟡 #4 | Generation devis depuis photos + metrés vocaux | 2-4h economisees/devis | Elevee |
| 🟡 #5 | Alertes renouvellement decennale/Qualibat | Zero oubli reglementaire | Faible |
| 🟢 #6 | Tri/organisation photos chantier par projet | 30min/semaine economisees | Faible |

---

## Stack OSS retenu

Tout est self-hosted, Docker Compose, licences open source compatibles usage commercial.

```
┌─────────────────────────────────────────────────────────────┐
│  DASHBOARD CLIENT                                           │
│  next-saas-boilerplate (MIT) — Next.js + Shadcn + Drizzle  │
│  → Multi-tenant Supabase RLS, RBAC, Stripe natif           │
├─────────────────────────────────────────────────────────────┤
│  AGENT CONVERSATIONNEL                                      │
│  Dify (Apache 2.0, 80k+ stars)                             │
│  → RAG sur corpus client, multi-LLM, API REST              │
├─────────────────────────────────────────────────────────────┤
│  VOICE (telephone artisan)                                  │
│  Pipecat + Twilio/SIP (BSD)                                │
│  → STT (Deepgram) → Dify API → TTS (Kokoro TTS)           │
├─────────────────────────────────────────────────────────────┤
│  WORKFLOW / AUTOMATIONS                                     │
│  n8n (Fair-code, 116k stars)                               │
│  → Devis reçu → Docling → extract → Twenty CRM            │
│  → Relances, rappels, alertes                              │
├─────────────────────────────────────────────────────────────┤
│  TRAITEMENT DOCUMENTS (PDF, factures, BL, devis)           │
│  Docling — IBM/Linux Foundation (MIT, 23k stars)           │
│  → 97.9% precision tables, Docker API, JSON/Markdown out   │
├─────────────────────────────────────────────────────────────┤
│  CRM LEGER                                                  │
│  Twenty CRM (AGPL v3, 40k stars)                           │
│  → Contacts, devis, suivi, MCP server natif                │
└─────────────────────────────────────────────────────────────┘
```

**Infra** : 1 VPS 16GB RAM (Hetzner ~15-25€/mois), Docker Compose. Shared pour 10-20 clients.

### Auth

- **Clerk** : gratuit jusqu'a 50K MAU et 100 orgs. Magic Link + Google OAuth + multi-org. Recommande MVP.
- **Supabase Auth** : si deja sur Supabase, zero surcoût.
- **Better Auth** (OSS, auto-heberge) : pour les clients qui veulent leur propre IdP.

---

## Provider routing — Coût quasi-zero

Orchestration via **LiteLLM Proxy** (self-hosted, OSS). Budget par client enforced.

```
Tache legere (classification, routing, extraction)
  → Ollama local (qwen2.5:3b) — 0€

Tache moyenne (resume, Q&A, reponse FAQ)
  → Gemini Flash free (250 req/j) ou Groq Llama 70B — 0€

Tache complexe (generation devis complet, analyse probleme)
  → Claude Haiku ou Sonnet — ~$0.003-0.005/req

Fallback si Ollama down
  → OpenRouter:deepseek-r1:free — 0€
```

**Fallback chain LiteLLM** :
```yaml
fallbacks:
  - routing_task: [gemini-flash, groq-llama, openrouter-free]
  - medium_task:  [groq-llama, gemini-flash, claude-haiku]
  - complex_task: [claude-sonnet, gpt-4o]
```

**Monitoring** : Langfuse self-hosted (OSS, Docker) — tokens/coût/latence par client, integre LiteLLM via callback.

### Estimation coût 10 clients actifs

| Poste | Volume/mois | Coût |
|-------|-------------|------|
| Ollama local (Mac/VPS) | 10 500 req | 0€ |
| Gemini/Groq free | 3 750 req | 0€ |
| Claude Sonnet (devis complexes) | 750 req | ~$3 |
| LiteLLM + Langfuse self-hosted | — | 0€ |
| **TOTAL LLM** | **15 000 req/mois** | **~3-5€** |

---

## Fine-tuning modeles metier

Chaque client (ou groupe metier) peut avoir un modele specialise. REX orchestre le pipeline.

### Workflow local (Mac M-series, gratuit)

```
1. Collecte : vraies conversations client (tickets, emails, chats, devis)
2. Synthese : Claude Opus genere variantes synthetiques (~$5-15 en tokens)
3. Format : ShareGPT JSONL multi-tour (agent conversationnel)
4. Fine-tune : MLX-LM + LoRA sur Qwen 3 8B (~2-4h, 14GB RAM, 0€)
5. Export : mlx_lm.fuse → llama.cpp convert → .gguf
6. Deploy : ollama create rex-artisan-plombier -f Modelfile
7. Monitor : W&B free tier (integre MLX-LM natif)
```

### Scale si besoin (GPU cloud)

- **RunPod A100** : ~$60-70 pour fine-tuner un 7B (50h)
- **HuggingFace AutoTrain** : ~$100-200 (plus simple, moins flexible)

### Auto-amelioration

Les sessions reelles de l'agent → captures dans REX memory → Opus extrait les lecons → enrichit le dataset → re-fine-tune periodique.

REX monitore : qualite des reponses, taux de satisfaction, topics non couverts.

---

## Modele economique

### Pricing

| Plan | Prix | Contenu |
|------|------|---------|
| **Starter** | 49€/mois | 1 agent, 500 interactions/mois, support email |
| **Pro** | 79€/mois | 3 agents, illimite, integrations (Google Cal, devis), support prioritaire |
| **Business** | 149€/mois | 5 agents + personnalisation, onboarding dedie, rapport mensuel |

**Setup fee** : 199€ HT (standard) ou 499€ HT (avec formation + migration donnees).

**Sweet spot** : 79-99€/mois — en dessous du seuil de friction artisan, ROI clairement demonstrable.

### Decomposition coûts par client

| Poste | Coût/mois |
|-------|-----------|
| LLM (mix tiers) | 3-8€ |
| Infra shared (fraction VPS) | 2-5€ |
| Auth (Clerk, fraction) | ~0.50€ |
| Monitoring/logs | ~0.50€ |
| Support (~30min/mois) | 15-25€ |
| **Total** | **21-39€** |

**Marge brute cible** : 50-60%. Break-even a ~10 clients.

### Workflow commercial

**Demo 15 min** (script) :
1. "Je vous economise 5h/semaine — demo sans CB"
2. Montrer : agent repond appel manque + genere devis + envoie SMS relance
3. Cas concret : "18h, chantier, client appelle — l'agent decroche, qualifie, planifie"
4. ROI live : 5h x taux horaire artisan
5. Closing : essai 14 jours, setup fee offert premier mois

**Canaux** : CAPEB/FFB, foires artisans, LinkedIn cible, groupes Facebook BTP.

---

## Architecture technique — REX Agent Factory

```
REX (Kevin/D-Studio)
│
├── rex create-client <nom> <metier>
│     → provisionne Supabase tenant (RLS)
│     → deploie Dify + n8n + Twenty CRM (Docker)
│     → configure Pipecat + Twilio (numero dedie)
│     → fine-tune modele corpus metier (MLX-LM)
│     → cree dashboard client (next-saas-boilerplate)
│
├── LiteLLM Proxy (multi-client)
│     → routing owned-first, free-first, payant en dernier
│     → budget enforced par client_id
│     → fallback chain automatique
│
├── Langfuse (monitoring)
│     → tokens/coût/latence par client
│     → alertes depassement budget
│     → quality scoring
│
├── REX Dashboard (Kevin)
│     → vue tous clients (MRR, health, usage)
│     → alertes client en difficulte
│     → pipeline fine-tuning (datasets, jobs, modeles)
│
└── Auto-amelioration
      → sessions agent → REX memory → lecons → dataset
      → Opus extrait patterns → re-fine-tune periodique
      → amelioration sans intervention manuelle
```

### Isolation donnees client

- **MVP (<50 clients)** : SQLite par client (fichier = tenant) ou Supabase RLS
- **Scale (50+ clients)** : PostgreSQL + Row Level Security
- **Export a la resiliation** : JSON/CSV disponible 30 jours, suppression 90 jours (RGPD)

### Scalabilite — Cloner un client

Objectif : `rex create-client` en < 30 min d'intervention manuelle.

```bash
rex create-client \
  --name "Jean-Paul Martin" \
  --trade "plombier" \
  --phone "+33612345678" \
  --plan pro
# → provisionne tout automatiquement
# → envoie email onboarding au client
# → cree son dashboard
# → lance fine-tuning corpus plombier
```

---

## Considerations legales (France)

| Point | Detail |
|-------|--------|
| **RGPD** | DPA (contrat sous-traitance art. 28) obligatoire avec chaque client artisan |
| **Hebergement** | EU suffisant (pas France obligatoire sauf donnees sante). Hetzner/OVH/Scaleway |
| **RC Pro** | Fortement recommandee : 500-2000€/an (Hiscox, Assurup). Cyber assurance en complement |
| **CNIL** | Registre des traitements + notification violation 72h |
| **Facturation electronique 2026** | Transition obligatoire — pain point artisan = opportunite d'integration |

---

## Prochaines etapes

### Demo MVP (objectif 2-3 semaines)

1. Deployer stack de demo : Dify + n8n + Twenty CRM sur VPS de test
2. Configurer 1 agent "Plombier demo" avec RAG (FAQ, devis type, horaires)
3. Brancher Pipecat + Twilio (numero de test)
4. Preparer script demo 15 min
5. Tester sur 2-3 artisans proches pour feedback reel

### Produit v1 (objectif 6-8 semaines)

- [ ] `rex create-client` CLI command
- [ ] Supabase RLS multi-tenant setup
- [ ] Pipeline fine-tuning automatise (collecte → MLX-LM → Ollama)
- [ ] LiteLLM config par client avec budget
- [ ] Langfuse self-hosted
- [ ] Dashboard Kevin (vue flotte clients)
- [ ] Dashboard client (vue son agent)
- [ ] Script onboarding < 30 min

---

## Docs de reference

- `docs/plans/action.md` — regles d'execution agents
- `docs/plans/2026-03-07-rex-v7-master-plan.md` — architecture REX v7
- Sources recherche : CAPEB ArtiSante 2025, Batiweb, Mediavenir, LiteLLM docs, Pipecat GitHub, Docling GitHub, Twenty CRM GitHub
