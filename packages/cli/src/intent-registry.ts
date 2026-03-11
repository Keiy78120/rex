/**
 * REX Intent Registry — Living Scripts Store
 *
 * Chaque intent résolu génère un script bash/TS.
 * Le script est scoré à chaque usage.
 * Plus le score est haut, plus le script est fiable → remplace le LLM.
 *
 * Storage: SQLite via better-sqlite3
 *
 * @module INTENTS
 */

import Database from 'better-sqlite3'
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { RexIntent, IntentCategory } from './intent-classifier.js'

const REX_DIR = join(homedir(), '.rex')
const DB_PATH = join(REX_DIR, 'intents.db')
const SCRIPTS_DIR = join(REX_DIR, 'scripts', 'intents')

export interface LivingScript {
  id: string
  category: IntentCategory
  pattern: string          // regex pattern original
  scriptPath: string       // chemin vers le script bash/TS
  scriptType: 'bash' | 'typescript'
  score: number            // nb d'utilisations réussies
  failCount: number        // nb d'échecs
  confidence: number       // score / (score + failCount)
  lastUsedAt?: string
  createdAt: string
  generatedBy: 'LLM' | 'USER' | 'MANUAL'
}

// ── Init DB ────────────────────────────────────────────────────────────

function getDb(): Database.Database {
  mkdirSync(REX_DIR, { recursive: true })
  mkdirSync(SCRIPTS_DIR, { recursive: true })

  const db = new Database(DB_PATH)
  db.exec(`
    CREATE TABLE IF NOT EXISTS living_scripts (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      pattern TEXT NOT NULL,
      script_path TEXT NOT NULL,
      script_type TEXT DEFAULT 'bash',
      score INTEGER DEFAULT 0,
      fail_count INTEGER DEFAULT 0,
      confidence REAL DEFAULT 0.5,
      last_used_at TEXT,
      created_at TEXT NOT NULL,
      generated_by TEXT DEFAULT 'LLM'
    );

    CREATE TABLE IF NOT EXISTS intent_log (
      id TEXT PRIMARY KEY,
      raw TEXT NOT NULL,
      source TEXT NOT NULL,
      category TEXT NOT NULL,
      script_id TEXT,
      cache_hit INTEGER DEFAULT 0,
      success INTEGER DEFAULT 1,
      duration_ms INTEGER,
      ts TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_category ON living_scripts(category);
    CREATE INDEX IF NOT EXISTS idx_score ON living_scripts(score DESC);
  `)
  return db
}

// ── Registry ───────────────────────────────────────────────────────────

export class IntentRegistry {
  private db: Database.Database

  constructor() {
    this.db = getDb()
  }

  // Trouver un script vivant pour une catégorie
  findScript(category: IntentCategory, minConfidence = 0.6): LivingScript | null {
    const row = this.db.prepare(`
      SELECT * FROM living_scripts
      WHERE category = ? AND confidence >= ?
      ORDER BY score DESC, confidence DESC
      LIMIT 1
    `).get(category, minConfidence) as any

    if (!row) return null
    return this.rowToScript(row)
  }

  // Trouver par pattern similarity (simple — version sémantique dans living-cache.ts)
  findByPattern(text: string, category: IntentCategory): LivingScript | null {
    const rows = this.db.prepare(`
      SELECT * FROM living_scripts WHERE category = ? ORDER BY score DESC
    `).all(category) as any[]

    for (const row of rows) {
      try {
        const re = new RegExp(row.pattern, 'i')
        if (re.test(text)) return this.rowToScript(row)
      } catch {}
    }
    return null
  }

  // Enregistrer un nouveau script généré
  registerScript(
    category: IntentCategory,
    pattern: string,
    script: string,
    type: 'bash' | 'typescript' = 'bash',
    generatedBy: 'LLM' | 'USER' | 'MANUAL' = 'LLM'
  ): LivingScript {
    const id = `script-${category}-${Date.now()}`
    const ext = type === 'typescript' ? '.ts' : '.sh'
    const scriptPath = join(SCRIPTS_DIR, `${id}${ext}`)
    const createdAt = new Date().toISOString()

    // Ajouter shebang si bash
    const content = type === 'bash'
      ? `#!/usr/bin/env bash\n# REX Living Script — ${category}\n# Generated: ${createdAt}\n# Pattern: ${pattern}\n\n${script}`
      : `// REX Living Script — ${category}\n// Generated: ${createdAt}\n\n${script}`

    writeFileSync(scriptPath, content, { mode: 0o755 })

    this.db.prepare(`
      INSERT INTO living_scripts
        (id, category, pattern, script_path, script_type, score, fail_count, confidence, created_at, generated_by)
      VALUES (?, ?, ?, ?, ?, 0, 0, 0.5, ?, ?)
    `).run(id, category, pattern, scriptPath, type, createdAt, generatedBy)

    return {
      id, category, pattern, scriptPath, scriptType: type,
      score: 0, failCount: 0, confidence: 0.5,
      createdAt, generatedBy,
    }
  }

  // Scorer un script (succès ou échec)
  scoreScript(scriptId: string, success: boolean): void {
    if (success) {
      this.db.prepare(`
        UPDATE living_scripts
        SET score = score + 1,
            last_used_at = ?,
            confidence = CAST(score + 1 AS REAL) / (score + fail_count + 1)
        WHERE id = ?
      `).run(new Date().toISOString(), scriptId)
    } else {
      this.db.prepare(`
        UPDATE living_scripts
        SET fail_count = fail_count + 1,
            confidence = CAST(score AS REAL) / (score + fail_count + 1)
        WHERE id = ?
      `).run(scriptId)
    }
  }

  // Logger un intent
  logIntent(intent: RexIntent, scriptId?: string, success = true, durationMs?: number): void {
    this.db.prepare(`
      INSERT INTO intent_log (id, raw, source, category, script_id, cache_hit, success, duration_ms, ts)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      intent.id, intent.raw.slice(0, 500), intent.source, intent.category,
      scriptId ?? null, intent.cacheHit ? 1 : 0, success ? 1 : 0,
      durationMs ?? null, intent.ts
    )
  }

  // Stats
  stats(): { totalScripts: number; totalIntents: number; cacheHitRate: number; topCategories: any[] } {
    const totalScripts = (this.db.prepare('SELECT COUNT(*) as c FROM living_scripts').get() as any).c
    const totalIntents = (this.db.prepare('SELECT COUNT(*) as c FROM intent_log').get() as any).c
    const hits = (this.db.prepare('SELECT COUNT(*) as c FROM intent_log WHERE cache_hit = 1').get() as any).c
    const topCategories = this.db.prepare(`
      SELECT category, COUNT(*) as count FROM intent_log GROUP BY category ORDER BY count DESC LIMIT 5
    `).all()

    return {
      totalScripts,
      totalIntents,
      cacheHitRate: totalIntents > 0 ? hits / totalIntents : 0,
      topCategories,
    }
  }

  // Lister les scripts avec le meilleur score
  topScripts(limit = 10): LivingScript[] {
    return (this.db.prepare(`
      SELECT * FROM living_scripts ORDER BY score DESC LIMIT ?
    `).all(limit) as any[]).map(r => this.rowToScript(r))
  }

  private rowToScript(row: any): LivingScript {
    return {
      id: row.id,
      category: row.category,
      pattern: row.pattern,
      scriptPath: row.script_path,
      scriptType: row.script_type,
      score: row.score,
      failCount: row.fail_count,
      confidence: row.confidence,
      lastUsedAt: row.last_used_at,
      createdAt: row.created_at,
      generatedBy: row.generated_by,
    }
  }
}
