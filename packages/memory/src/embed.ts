const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const MODEL = process.env.EMBED_MODEL || "nomic-embed-text";

export async function embed(text: string): Promise<Float32Array> {
  const res = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, input: text }),
  });

  if (!res.ok) {
    throw new Error(`Ollama embed failed: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as { embeddings: number[][] };
  return new Float32Array(json.embeddings[0]);
}

export function embeddingToBuffer(embedding: Float32Array): Buffer {
  return Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
}

export const EMBEDDING_DIM = 768; // nomic-embed-text dimension

// ── fastembed backend (used when Ollama is unavailable) ───────

import { FlagEmbedding, EmbeddingModel } from "fastembed";

let _fastEmbedder: FlagEmbedding | null = null;

export async function fastEmbed(texts: string[]): Promise<number[][]> {
  if (!_fastEmbedder) {
    _fastEmbedder = await FlagEmbedding.init({
      model: EmbeddingModel.BGESmallENV15,
    });
  }
  const results: number[][] = [];
  for await (const batch of _fastEmbedder.embed(texts, 32)) {
    for (const vec of batch) {
      results.push(Array.from(vec));
    }
  }
  return results;
}
