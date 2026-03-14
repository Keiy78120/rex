# REX Stack Audit — Node.js + Rust Strategy

> Date : 14/03/2026
> Conclusion : Node.js = 90% (I/O-bound), Rust NAPI-RS = 10% ciblé (hot paths futurs)

---

## Stack actuelle

| Composant | Techno | Rôle |
|-----------|--------|------|
| CLI + Daemon | TypeScript / Node 22 | Orchestration, routing, gateway, fleet, signals |
| Memory | TypeScript + SQLite + sqlite-vec | Mémoire sémantique vectorielle |
| App | Flutter / Dart | App macOS native |
| LLM local | Ollama | Inference + embedding (nomic-embed-text) |
| Build | tsup (ESM) | Bundle CLI |
| Tests | vitest | 1449 tests |

## Audit par fonction

### Node.js = PARFAIT (ne pas toucher)

| Fonction | Raison |
|----------|--------|
| Daemon 30+ cycles | I/O-bound, event loop optimal |
| Gateway Telegram | Network I/O pur |
| Hub API (port 7420) | HTTP server, domaine de Node |
| Fleet sync | Réseau + SQLite |
| Signal detection | `execSync` + fs reads, ~5ms/cycle |
| Intent routing | Regex, < 1ms |
| Tool injection | Pure logique, < 1ms |
| Config/paths/logger | Trivial |
| Setup wizard | Interactif |

### Rust NAPI-RS = utile sur 3 hot paths (FUTUR)

| Hot path | Problème Node | Solution Rust | Trigger |
|----------|--------------|---------------|---------|
| **Vector search** | sqlite-vec brute-force, explose à 1M+ (8.5s pour 3072 dims) | LanceDB embedded (IVF_PQ, 40-60ms à 1M) | Memory > 50K entries |
| **Embedding local** | Dépendance Ollama, si down = pas d'embed | candle/ort via NAPI-RS, ~5ms/chunk sans Ollama | Quand on veut embed sans Ollama |
| **File parsing (REX Scan)** | Analyser des centaines de repos = lent en Node | rayon (parallélisme), 2-4x plus rapide | REX Scan P2 |

### PAS prioritaire

| Idée | Pourquoi non |
|------|-------------|
| Réécrire CLI en Rust | 90% I/O-bound, Node suffit. Complexité build multi-arch. Solo dev. |
| CLI startup (100ms→10ms) | Pas perceptible pour l'usage REX |
| Crypto/hashing Rust | Volumes trop faibles, Node crypto suffit |
| Rust daemon | Event loop Node = parfait pour daemon I/O |

## Architecture cible

```
packages/
├── cli/          ← TypeScript (inchangé, 90%)
├── core/         ← TypeScript (health checks)
├── memory/       ← TypeScript + Rust addon (futur P1)
│   └── native/   ← 🦀 NAPI-RS : LanceDB + embed
├── flutter_app/  ← Dart
└── scan/         ← 🦀 Futur P2 : file parsing parallèle
```

## Quand migrer

1. **Memory > 50K entries** → LanceDB remplace sqlite-vec
2. **Ollama pas fiable** → embed Rust natif (candle/ort NAPI-RS)
3. **REX Scan implémenté** → Rust + rayon pour parsing massif

## Stack finale

```
Node.js (TypeScript)     → 90% — orchestration, I/O, daemon, gateway
Rust (NAPI-RS)           → 10% — vector search, embedding, scan
SQLite                   → DB locale (mémoire, events, budget)
LanceDB (Rust, futur)    → remplace sqlite-vec à l'échelle
Ollama                   → LLM inference
rex-worker (fine-tuné)   → tâches autonomes (routing, classify)
```
