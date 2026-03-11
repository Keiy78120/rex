/**
 * REX Living Cache — Semantic Cache plug memory + ecosystem
 *
 * Cache sémantique via nomic-embed-text (local VPS, 0€).
 * Chaque intent résolu est stocké avec son embedding.
 * Lookup via similarity — si match > threshold → 0 LLM token.
 *
 * Architecture:
 *   Input text → embed (nomic-embed-text) → sqlite-vec similarity search
 *   → CACHE HIT: retourne résultat direct + script associé
 *   → CACHE MISS: résout via LLM → stocke embedding + résultat → script vivant
 *
 * Intégration memory REX:
 *   - MEMORY.md facts → indexed dans le cache au boot
 *   - observations YAML → indexed automatiquement
 *   - intent log → feedback loop pour améliorer les embeddings
 *
 * @module MEMORY
 */

import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import Database from 'better-sqlite3'
import type { RexIntent } from './intent-classifier.js'

const REX_DIR = join(homedir(), '.rex')
const CACHE_DB_PATH = join(REX_DIR, 'semantic-cache.db')
const OLLAMA_URL = 'http://127.0.0.1:11434'
const EMBED_MODEL = 'nomic-embed-text'
const SIMILARITY_THRESHOLD = 0.82  // Très précis — évite les faux positifs

export interface CacheEntry {
  id: string
  intentId?: string
  text: string              // texte original
  category: string
  result: string            // résultat JSON serialisé
  scriptId?: string         // script vivant associé
  embedding?: number[]      // vecteur (stocké en blob)
  score: number             // nb d'utilisations
  ttl?: number              // expiration en ms (0 = permanent)
  createdAt: string
  lastHitAt?: string
  source: 'LLM' | 'SCRIPT' | 'MEMORY' | 'MANUAL'
}

// ── Embedding via Ollama nomic-embed-text ──────────────────────────────

export async function embed(text: string): Promise<number[]> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
      signal: AbortSignal.timeout(5000),
    })
    const data = await res.json() as any
    return data.embedding ?? []
  } catch {
    // Fallback: BM25 keyword hash (si Ollama down)
    return bm25Hash(text)
  }
}

// Fallback BM25 — hash léger pour similarité keyword
function bm25Hash(text: string): number[] {
  const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 2)
  const vec = new Float32Array(128).fill(0)
  for (const word of words) {
    let h = 5381
    for (let i = 0; i < word.length; i++) h = ((h << 5) + h) ^ word.charCodeAt(i)
    vec[Math.abs(h) % 128] += 1
  }
  // Normalize
  const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1
  return Array.from(vec.map(v => v / mag))
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0, magA = 0, magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB) || 1)
}

// ── DB Init ────────────────────────────────────────────────────────────

function getDb(): Database.Database {
  mkdirSync(REX_DIR, { recursive: true })
  const db = new Database(CACHE_DB_PATH)
  db.exec(`
    CREATE TABLE IF NOT EXISTS cache_entries (
      id TEXT PRIMARY KEY,
      intent_id TEXT,
      text TEXT NOT NULL,
      category TEXT NOT NULL,
      result TEXT NOT NULL,
      script_id TEXT,
      embedding BLOB,
      score INTEGER DEFAULT 0,
      ttl INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      last_hit_at TEXT,
      source TEXT DEFAULT 'LLM'
    );

    CREATE INDEX IF NOT EXISTS idx_category_cache ON cache_entries(category);
    CREATE INDEX IF NOT EXISTS idx_score_cache ON cache_entries(score DESC);
  `)
  return db
}

// ── Living Cache ───────────────────────────────────────────────────────

export class LivingCache {
  private db: Database.Database

  constructor() {
    this.db = getDb()
  }

  async lookup(text: string, category: string): Promise<CacheEntry | null> {
    const queryEmbed = await embed(text)

    // Récupérer tous les entries de la même catégorie
    const rows = this.db.prepare(`
      SELECT * FROM cache_entries
      WHERE category = ?
        AND (ttl = 0 OR datetime(created_at, '+' || (ttl/1000) || ' seconds') > datetime('now'))
      ORDER BY score DESC
      LIMIT 100
    `).all(category) as any[]

    let bestMatch: any = null
    let bestScore = 0

    for (const row of rows) {
      if (!row.embedding) continue
      const rowEmbed = Array.from(new Float64Array(Buffer.from(row.embedding, 'base64').buffer))
      const sim = cosineSimilarity(queryEmbed, rowEmbed)

      if (sim > bestScore && sim >= SIMILARITY_THRESHOLD) {
        bestScore = sim
        bestMatch = row
      }
    }

    if (!bestMatch) return null

    // Update hit score
    this.db.prepare(`
      UPDATE cache_entries
      SET score = score + 1, last_hit_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), bestMatch.id)

    return {
      id: bestMatch.id,
      intentId: bestMatch.intent_id,
      text: bestMatch.text,
      category: bestMatch.category,
      result: bestMatch.result,
      scriptId: bestMatch.script_id,
      score: bestMatch.score + 1,
      ttl: bestMatch.ttl,
      createdAt: bestMatch.created_at,
      lastHitAt: new Date().toISOString(),
      source: bestMatch.source,
    }
  }

  async store(
    text: string,
    category: string,
    result: string,
    options: {
      intentId?: string
      scriptId?: string
      ttl?: number   // ms, 0 = permanent
      source?: CacheEntry['source']
    } = {}
  ): Promise<CacheEntry> {
    const id = `cache-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const embedding = await embed(text)
    const embeddingBlob = Buffer.from(new Float64Array(embedding).buffer).toString('base64')
    const createdAt = new Date().toISOString()

    this.db.prepare(`
      INSERT INTO cache_entries (id, intent_id, text, category, result, script_id, embedding, ttl, created_at, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, options.intentId ?? null, text, category, result,
      options.scriptId ?? null, embeddingBlob,
      options.ttl ?? 0, createdAt, options.source ?? 'LLM'
    )

    return {
      id, text, category, result, score: 0,
      createdAt, source: options.source ?? 'LLM', ...options,
    }
  }

  // ── Memory integration ────────────────────────────────────────────────

  // Indexer MEMORY.md dans le cache (au boot ou sur demande)
  async ingestMemoryFile(path: string): Promise<number> {
    if (!existsSync(path)) return 0
    const content = readFileSync(path, 'utf-8')

    // Parser les sections ## comme des facts
    const sections = content.split(/^## /m).filter(s => s.trim())
    let count = 0

    for (const section of sections) {
      const lines = section.split('\n')
      const title = lines[0].trim()
      const body = lines.slice(1).join('\n').trim()
      if (!body || body.length < 20) continue

      // Check si déjà dans le cache
      const existing = await this.lookup(title, 'MEMORY')
      if (existing) continue

      await this.store(title, 'MEMORY', body, {
        ttl: 0, // permanent
        source: 'MEMORY',
      })
      count++
    }

    return count
  }

  // Indexer les observations YAML
  async ingestObservations(dir: string): Promise<number> {
    const { readdirSync } = await import('node:fs')
    let count = 0

    try {
      const files = readdirSync(dir).filter(f => f.endsWith('.yaml'))

      for (const file of files.slice(-7)) { // 7 derniers jours
        const content = readFileSync(join(dir, file), 'utf-8')
        // Parser YAML simple (pas besoin de lib)
        const entries = content.split(/^- type:/m).filter(Boolean)

        for (const entry of entries) {
          const eventMatch = entry.match(/event: "(.+?)"/)
          const detailsMatch = entry.match(/solution: "(.+?)"/)
          if (!eventMatch) continue

          const key = eventMatch[1]
          const value = detailsMatch?.[1] ?? entry.slice(0, 200)

          await this.store(key, 'MEMORY', value, { source: 'MEMORY', ttl: 7 * 24 * 60 * 60 * 1000 })
          count++
        }
      }
    } catch {}

    return count
  }

  // Stats cache
  stats(): { total: number; hitRate: number; byCategory: any[]; topEntries: any[] } {
    const total = (this.db.prepare('SELECT COUNT(*) as c FROM cache_entries').get() as any).c
    const totalHits = (this.db.prepare('SELECT SUM(score) as s FROM cache_entries').get() as any).s ?? 0
    const byCategory = this.db.prepare(`
      SELECT category, COUNT(*) as count, SUM(score) as hits
      FROM cache_entries GROUP BY category ORDER BY hits DESC
    `).all()
    const topEntries = this.db.prepare(`
      SELECT text, category, score, source FROM cache_entries ORDER BY score DESC LIMIT 5
    `).all()

    return { total, hitRate: total > 0 ? totalHits / total : 0, byCategory, topEntries }
  }
}
