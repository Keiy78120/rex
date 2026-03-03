import { getDb } from "./ingest.js";
import { embed, embeddingToBuffer } from "./embed.js";

export interface SearchResult {
  content: string;
  category: string;
  score: number;
  created_at: string;
}

export async function search(query: string, limit: number = 10): Promise<SearchResult[]> {
  const db = getDb();
  const queryEmbedding = await embed(query);
  const buf = embeddingToBuffer(queryEmbedding);

  const rows = db
    .prepare(
      `SELECT m.content, m.category, m.created_at, vec_distance_cosine(e.embedding, ?) as distance
       FROM memory_vec e
       JOIN memories m ON m.id = e.rowid
       ORDER BY distance ASC
       LIMIT CAST(? AS INTEGER)`
    )
    .all(buf, limit) as Array<{ content: string; category: string; created_at: string; distance: number }>;

  return rows.map((r) => ({
    content: r.content,
    category: r.category,
    score: 1 - r.distance,
    created_at: r.created_at,
  }));
}
