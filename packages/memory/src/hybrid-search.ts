import { getDb } from "./ingest.js";
import { embed, embeddingToBuffer } from "./embed.js";
import type { SearchResult } from "./search.js";

// RRF k constant (standard value from the paper)
const RRF_K = 60;

// Number of candidates to fetch from each retriever before fusion
const CANDIDATE_LIMIT = 50;

export interface HybridSearchResult extends SearchResult {
  bm25Rank: number | null;
  vectorRank: number | null;
  rrfScore: number;
}

/**
 * Convert a user query into an FTS5 MATCH expression.
 * Splits on whitespace, drops very short tokens, joins as OR terms.
 * Wraps each token in quotes to prevent FTS5 syntax errors.
 */
function toFtsQuery(q: string): string {
  const tokens = q
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, "").toLowerCase())
    .filter((w) => w.length >= 2);
  if (!tokens.length) return '""';
  return tokens.map((t) => `"${t}"`).join(" OR ");
}

/**
 * Hybrid search: BM25 (FTS5) + cosine vector similarity, fused via Reciprocal Rank Fusion.
 * @param query  Natural-language query string
 * @param limit  Number of results to return
 * @param alpha  Weight for vector score (0–1); BM25 weight = 1 - alpha. Default 0.7
 */
export async function hybridSearch(
  query: string,
  limit: number = 10,
  alpha = 0.7
): Promise<HybridSearchResult[]> {
  const db = getDb();

  // ── 1. BM25 retrieval via FTS5 ────────────────────────────────────────────
  type FtsRow = { rowid: number; rank: number };
  let ftsRows: FtsRow[] = [];

  const ftsQuery = toFtsQuery(query);
  if (ftsQuery !== '""') {
    try {
      ftsRows = db
        .prepare(
          `SELECT rowid, rank
           FROM memory_fts
           WHERE memory_fts MATCH ?
           ORDER BY rank
           LIMIT CAST(? AS INTEGER)`
        )
        .all(ftsQuery, CANDIDATE_LIMIT) as FtsRow[];
    } catch {
      // FTS5 query syntax error — fall back to pure vector search
      ftsRows = [];
    }
  }

  // ── 2. Vector retrieval ───────────────────────────────────────────────────
  const queryEmbedding = await embed(query);
  const buf = embeddingToBuffer(queryEmbedding);

  type VecRow = { id: number; content: string; category: string; created_at: string; source: string | null; distance: number };
  const vecRows = db
    .prepare(
      `SELECT m.id, m.content, m.category, m.created_at, m.source,
              vec_distance_cosine(e.embedding, ?) as distance
       FROM memory_vec e
       JOIN memories m ON m.id = e.rowid
       ORDER BY distance ASC
       LIMIT CAST(? AS INTEGER)`
    )
    .all(buf, CANDIDATE_LIMIT) as VecRow[];

  // ── 3. Build lookup map for BM25 ranks ────────────────────────────────────
  const bm25RankMap = new Map<number, number>(); // rowid → rank (1-based)
  ftsRows.forEach((r, i) => bm25RankMap.set(r.rowid, i + 1));

  // ── 4. Build lookup map for vector ranks ──────────────────────────────────
  const vecRankMap = new Map<number, number>(); // id → rank (1-based)
  const vecInfoMap = new Map<number, VecRow>();
  vecRows.forEach((r, i) => {
    vecRankMap.set(r.id, i + 1);
    vecInfoMap.set(r.id, r);
  });

  // ── 5. Collect all candidate IDs ─────────────────────────────────────────
  const allIds = new Set<number>([
    ...bm25RankMap.keys(),
    ...vecRankMap.keys(),
  ]);

  // Fetch content for BM25-only candidates not in vecInfoMap
  const bm25OnlyIds = [...bm25RankMap.keys()].filter((id) => !vecInfoMap.has(id));
  if (bm25OnlyIds.length) {
    const placeholders = bm25OnlyIds.map(() => "?").join(",");
    const extra = db
      .prepare(`SELECT id, content, category, created_at, source FROM memories WHERE id IN (${placeholders})`)
      .all(...bm25OnlyIds) as Array<{ id: number; content: string; category: string; created_at: string; source: string | null }>;
    extra.forEach((r) =>
      vecInfoMap.set(r.id, { ...r, distance: 1 })
    );
  }

  // ── 6. RRF fusion ─────────────────────────────────────────────────────────
  type Entry = {
    rrfScore: number;
    bm25Rank: number | null;
    vectorRank: number | null;
    row: VecRow;
  };

  const entries: Entry[] = [];
  for (const id of allIds) {
    const bm25Rank = bm25RankMap.get(id) ?? null;
    const vectorRank = vecRankMap.get(id) ?? null;
    const row = vecInfoMap.get(id);
    if (!row) continue;

    // Weighted RRF: alpha controls vector weight, (1-alpha) BM25 weight
    const bm25Term = bm25Rank !== null ? (1 - alpha) / (RRF_K + bm25Rank) : 0;
    const vecTerm = vectorRank !== null ? alpha / (RRF_K + vectorRank) : 0;
    const rrfScore = bm25Term + vecTerm;

    entries.push({ rrfScore, bm25Rank, vectorRank, row });
  }

  entries.sort((a, b) => b.rrfScore - a.rrfScore);

  // ── 7. Map to output shape ────────────────────────────────────────────────
  return entries.slice(0, limit).map((e) => ({
    content: e.row.content,
    category: e.row.category,
    score: e.rrfScore,
    created_at: e.row.created_at,
    bm25Rank: e.bm25Rank,
    vectorRank: e.vectorRank,
    rrfScore: e.rrfScore,
  }));
}

/**
 * Rebuild the FTS5 index from the memories table.
 * Run after bulk imports that bypass learn() (e.g., legacy ingest).
 */
export function rebuildFtsIndex(): void {
  const db = getDb();
  db.exec(`
    DELETE FROM memory_fts;
    INSERT INTO memory_fts(rowid, content) SELECT id, content FROM memories;
  `);
}
