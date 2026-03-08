/**
 * REX Memory Reindex
 *
 * Re-embeds all memories using the current Ollama model.
 * Use after changing the embedding model or corrupted embeddings.
 *
 * Algorithm:
 *   1. Read all memories from memories table
 *   2. Clear memory_vec (drop + recreate)
 *   3. Re-embed each chunk with throttle
 *   4. Re-insert into memory_vec
 *
 * §22 Token Economy — zero LLM, pure script + Ollama embed
 */

import Database from 'better-sqlite3'
import { embed, embeddingToBuffer, EMBEDDING_DIM } from './embed.js'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DB_PATH = process.env.REX_MEMORY_DB
  || join(homedir(), '.claude', 'rex', 'memory', 'rex.sqlite')

const THROTTLE_MS = parseInt(process.env.REX_EMBED_THROTTLE_MS ?? '300', 10)
const DRY_RUN = process.argv.includes('--dry-run')

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function main() {
  if (!existsSync(DB_PATH)) {
    console.error(`DB not found: ${DB_PATH}`)
    process.exit(1)
  }

  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')

  // Load sqlite-vec
  const vecExtPath = join(import.meta.dirname ?? '', '..', 'node_modules', 'sqlite-vec', 'dist')
  const candidates = [
    join(vecExtPath, 'vec0.dylib'),
    join(vecExtPath, 'vec0.so'),
    '/usr/local/lib/vec0.dylib',
    '/usr/local/lib/vec0.so',
  ]
  for (const p of candidates) {
    if (existsSync(p)) { try { db.loadExtension(p) } catch {} ; break }
  }

  // Count memories
  const total = (db.prepare('SELECT COUNT(*) as n FROM memories').get() as { n: number }).n
  if (total === 0) { console.log('No memories to reindex.'); return }

  console.log(`Reindexing ${total} memories${DRY_RUN ? ' (dry-run)' : ''}...`)

  if (DRY_RUN) {
    console.log(`Would re-embed ${total} chunks using current model (${process.env.EMBED_MODEL || 'nomic-embed-text'})`)
    return
  }

  // Clear existing embeddings
  try {
    db.exec(`DROP TABLE IF EXISTS memory_vec`)
    db.exec(`CREATE VIRTUAL TABLE memory_vec USING vec0(embedding float[${EMBEDDING_DIM}])`)
  } catch (e: any) {
    console.error(`Failed to reset memory_vec: ${e.message}`)
    process.exit(1)
  }

  const rows = db.prepare('SELECT id, content FROM memories ORDER BY id ASC').all() as Array<{ id: number; content: string }>

  let done = 0
  let failed = 0

  const insertVec = db.prepare('INSERT INTO memory_vec (rowid, embedding) VALUES (CAST(? AS INTEGER), ?)')

  for (const row of rows) {
    try {
      const embedding = await embed(row.content)
      insertVec.run(row.id, embeddingToBuffer(embedding))
      done++
      if (done % 10 === 0 || done === total) {
        process.stdout.write(`\r  ${done}/${total} reindexed (${failed} failed)...`)
      }
      if (done < total) await sleep(THROTTLE_MS)
    } catch (e: any) {
      failed++
      console.error(`\nFailed to embed memory #${row.id}: ${e.message?.slice(0, 80)}`)
    }
  }

  console.log(`\n\nReindex complete: ${done} succeeded, ${failed} failed out of ${total} total.`)
  db.close()
}

main().catch(e => { console.error(e); process.exit(1) })
