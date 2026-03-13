# REX — Modèles à Fine-tuner

> Référence modèles open-source pour fine-tuning local sur la fleet REX.
> Auteur : Milo · Date : 2026-03-13 · Sources : HuggingFace, Unsloth, LocalLLaMA

---

## Hardware cible
- **RTX 3090** (24 GB GDDR6X) — fine-tuning QLoRA jusqu'à 32B
- **Mac M4 Pro** (36 GB unifiée) — inférence + fine-tuning léger via MLX

---

## Shortlist 2025 (à jour avril 2025)

| Modèle | Taille | Use case REX | 3090 fine-tune | Licence |
|--------|--------|-------------|----------------|---------|
| **Qwen3-8B** ⭐ | 8B | Agent principal, code TS/Python, reasoning | ✅ QLoRA | Apache 2.0 |
| **Qwen3-4B** | 4B | Router rapide, réponses inline | ✅ Full | Apache 2.0 |
| **Qwen3-30B-MoE** | 30B (3B actifs) | Raisonnement complexe, planning | ✅ QLoRA | Apache 2.0 |
| **Gemma 3 4B** | 4B | Vision (screenshots Mac), instruction | ✅ Full | Apache 2.0 |
| **DeepSeek-R1-Distill-7B** | 7B | Chain-of-thought, décisions agent | ✅ QLoRA | MIT |
| **Llama 4 Scout** | MoE | Agentic natif, tool-calling, multimodal | ⚠️ API only | Llama 4 |

---

## Modèle recommandé : Qwen3-8B

**Pourquoi :**
- Sorti le 28 avril 2025 — dernier état de l'art open-source
- **Thinking mode** intégré (on/off) → raisonnement à la demande
- Excellent sur code TypeScript/Python/Flutter
- Apache 2.0 → peut être fine-tuné et redistribué
- Unsloth optimisé → 2x plus rapide, 70% moins VRAM

**Fine-tune dataset idéal pour REX :**
- Sessions JSONL depuis `~/.claude/projects/` ou sessions OpenClaw
- `CLAUDE.md` / `AGENTS.md` / `SOUL.md` comme system prompts
- Exemples d'actions rex CLI (input → output attendu)

---

## Stack fine-tuning recommandée

```bash
# Installation
pip install unsloth

# Fine-tune Qwen3-8B QLoRA sur 3090
from unsloth import FastLanguageModel
model, tokenizer = FastLanguageModel.from_pretrained(
    model_name="Qwen/Qwen3-8B",
    max_seq_length=8192,
    load_in_4bit=True,  # QLoRA
)
```

**Outils :**
- **Unsloth** — https://github.com/unslothai/unsloth — 2x faster, supporte Qwen3/Llama4/DeepSeek/Gemma
- **Axolotl** — alternative plus configurable pour datasets complexes
- **MLX-LM** — fine-tuning natif Mac M4 (Apple Silicon)

---

## Qwen3 — Famille complète (avril 2025)

Dense : 0.6B · 1.7B · 4B · **8B** · 14B · 32B
MoE : 30B (3B actifs) · 235B (22B actifs)
Tous Apache 2.0 — https://github.com/QwenLM/Qwen3

---

## Liens utiles
- Qwen3 : https://github.com/QwenLM/Qwen3
- Unsloth : https://unsloth.ai · https://github.com/unslothai/unsloth
- DeepSeek-R1-Distill : https://huggingface.co/deepseek-ai/DeepSeek-R1-Distill-Qwen-7B
- Gemma 3 : https://huggingface.co/google/gemma-3-4b-it
- Small LLM Leaderboard : https://awesomeagents.ai/leaderboards/small-language-model-leaderboard/
- DisTrO (fleet training) : voir `rex-fleet-distributed-training.md`
