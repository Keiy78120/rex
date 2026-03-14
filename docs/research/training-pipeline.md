# REX Training Pipeline (Draft)

Date: 2026-03-05
Scope: local-first training workflow from REX memory to fine-tuned open model.

## Objective

Build a repeatable pipeline:
1. Export useful conversational/code traces from REX memory.
2. Convert to train format.
3. Fine-tune locally (macOS priority) or on GPU host.
4. Evaluate and roll out model for REX local tasks.

## Candidate stacks

| Stack | Best for | Notes |
|---|---|---|
| `mlx-lm` | macOS Apple Silicon | Native MLX, simple local iteration, good for LoRA workflows. |
| `unsloth` | NVIDIA Linux GPU | Fast QLoRA, strong ecosystem for Qwen/Llama style finetunes. |
| `LLaMA-Factory` | cross-platform lab | Good UI/CLI orchestration, broader recipe support. |

## Recommended strategy

- Phase A (macOS): use `mlx-lm` for first local supervised finetune from curated REX traces.
- Phase B (GPU optional): use `unsloth` for larger run / better throughput.
- Keep dataset format compatible with both (`jsonl` chat turns).

## Data sources in REX

- SQLite memory: `~/.rex-memory/rex-memory.db`
- Pending chunks: `~/.rex-memory/pending/`
- Claude sessions/logs already ingested by REX memory flows

## Dataset schema (target)

Use simple chat format per sample:

```json
{
  "id": "rex-2026-03-05-0001",
  "messages": [
    {"role": "system", "content": "You are a coding assistant."},
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "..."}
  ],
  "meta": {
    "source": "rex-memory",
    "category": "coding",
    "timestamp": "2026-03-05T12:00:00Z"
  }
}
```

## Curation rules

- Keep only high-signal samples (clear prompt + useful answer).
- Remove secrets, tokens, personal data.
- Deduplicate near-identical traces.
- Prefer coding/debugging/devops tasks first.
- Keep bilingual FR/EN support.

## Evaluation gates

Before any deployment:

1. Instruction-following set (20-50 prompts).
2. Coding regression set (small deterministic tasks).
3. Safety/red-team quick checks (prompt injection style).
4. Latency/quality tradeoff validation on target machine.

## Rollout model in REX

- Export adapter or merged model.
- Register model in Ollama.
- Set via env for specific tasks (optimize, categorize, voice optimize).
- Keep fallback model in case of regression.

## Open tasks

- Implement exporter: SQLite -> curated `jsonl`.
- Add eval harness (`packages/memory` or dedicated `packages/train`).
- Add UI stub in Flutter (dataset export + run status).
- Add CLI commands:
  - `rex train export`
  - `rex train run`
  - `rex train eval`

