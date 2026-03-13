# REX Fleet — Distributed P2P Training

> Plan d'intégration d'un nœud GPU distribué dans la fleet REX.
> Auteur : Milo · Date : 2026-03-13

---

## Vision

Transformer les machines de Kevin (Mac M4 Pro + RTX 3090 PC) en **nœuds d'entraînement P2P** capables de co-entraîner un modèle sans infrastructure centralisée.
Chaque machine tient une portion du modèle (pipeline parallelism) ou accumule des gradients de façon asynchrone (DisTrO/Hivemind).

---

## Technologies de référence

### 1. DisTrO — NousResearch
- **Repo :** https://github.com/NousResearch/DisTrO
- **Principe :** optimizers distribués qui réduisent la communication inter-GPU de **3 à 4 ordres de grandeur** → fonctionne sur internet normal (pas besoin d'InfiniBand)
- **Clé :** supporte les réseaux hétérogènes et les connexions lentes
- **Use case REX :** idéal pour Mac ↔ PC via Tailscale/internet

### 2. Prime Intellect / INTELLECT-2
- **Blog :** https://www.primeintellect.ai/blog/intellect-2
- **Repo :** https://github.com/PrimeIntellect-ai/prime
- **Exploit :** entraîné INTELLECT-2 (32B) via RL décentralisé, nœuds hétérogènes, permissionless
- **Principe :** rollout generation + policy updates distribués et loosely coupled
- **Use case REX :** architecture de référence pour la fleet, chaque nœud contribue à son rythme

### 3. Hivemind — Learning at Home
- **Repo :** https://github.com/learning-at-home/hivemind
- **Principe :** DHT-based P2P, gradients accumulés sur des milliers de volontaires
- **Avantage :** bien documenté, exemples concrets (ALBERT training)
- **Mac :** support natif · **Windows/WSL :** expérimental avec GPU CUDA
- **Use case REX :** POC le plus accessible pour 2 nœuds

### 4. NVIDIA Pipeline Parallelism (NeMo / Megatron-LM)
- **Docs :** https://docs.nvidia.com/nemo-framework/user-guide/latest/nemotoolkit/features/parallelisms.html
- **Principe :** chaque GPU tient un sous-ensemble de layers (model chunks). Le modèle "stream" couche par couche → jamais besoin du modèle entier en RAM
- **Config :** `pipeline_model_parallel_size=N` + `virtual_pipeline_model_parallel_size`
- **Use case REX :** pour entraîner des modèles >7B en répartissant les layers entre Mac et PC

---

## Architecture REX Fleet

```
┌─────────────────────────────────────────────────────┐
│                   REX Fleet                          │
│                                                      │
│  Node A: Mac M4 Pro (Neural Engine)                  │
│  └── rex fleet register --role trainer               │
│  └── Layers 0-N/2 OU gradients async                │
│                                                      │
│  Node B: RTX 3090 PC (CUDA)                          │
│  └── rex fleet register --role trainer               │
│  └── Layers N/2-N OU gradients async                │
│                                                      │
│  Coordinator: VPS (léger, dispatch only)             │
│  └── rex fleet coordinator                           │
│  └── Agrège, dispatch, monitore                     │
│                                                      │
│  Tunnel: Tailscale (P2P direct si possible)          │
└─────────────────────────────────────────────────────┘
```

---

## Phases d'implémentation

### Phase 1 — POC Hivemind (2 nœuds)
- [ ] Installer Hivemind sur Mac + PC
- [ ] Entraîner un petit modèle (ALBERT small) en P2P
- [ ] Valider la connectivité Tailscale entre les deux machines
- [ ] Mesurer les perfs réelles (tokens/s, latence gradient sync)

### Phase 2 — CLI `rex fleet`
```bash
rex fleet register    # enregistre ce nœud dans la fleet
rex fleet status      # état de tous les nœuds
rex fleet train <model> --dataset <path>  # lance un job distribué
rex fleet logs        # logs en temps réel
```

### Phase 3 — Pipeline Parallelism (modèles > 3B)
- [ ] Intégrer NeMo ou Megatron-LM
- [ ] Mapper les layers : Mac → layers 0-16, PC → layers 16-32
- [ ] Implémenter `virtual_pipeline_model_parallel_size` pour minimiser les bulles
- [ ] Benchmark vs entraînement single-node

### Phase 4 — DisTrO (long terme)
- [ ] Migrer vers DisTrO pour réduire la bande passante nécessaire
- [ ] Ouvrir la fleet à des nœuds externes (amis, communauté)

---

## Considérations techniques

| Aspect | Mac M4 Pro | RTX 3090 |
|--------|-----------|---------|
| Framework | MLX (Apple) ou PyTorch MPS | PyTorch CUDA |
| Mémoire GPU | 36 GB unifiée | 24 GB GDDR6X |
| Bande passante | Tailscale (50-200 Mbps) | Tailscale |
| Rôle idéal | Layers bas / embedding | Layers hauts / compute |

**Hétérogénéité Mac ↔ CUDA :** DisTrO et Hivemind gèrent nativement les backends différents via des abstractions PyTorch. La clé est d'utiliser `torch.distributed` avec un backend gloo (CPU/réseau) pour la synchronisation cross-platform.

---

## Références supplémentaires
- OpenDiLoCo : https://github.com/PrimeIntellect-ai/open-diloco
- Petals (inference P2P) : https://github.com/bigscience-workshop/petals
- Pavel Durov / TON compute network : inspiration architecture permissionless
- Paper Géo-distribué hétérogène : https://www.sciopen.com/article/10.26599/BDMA.2025.9020031

---

## Prochaine action
`[ ]` Tester Hivemind POC sur Mac + PC (2h setup estimé)
