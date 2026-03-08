import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { readFileSync, readdirSync, existsSync, statSync, mkdirSync, unlinkSync, writeFileSync as writeFS } from "fs";
import { join, basename } from "path";
import { embed, embeddingToBuffer, EMBEDDING_DIM } from "./embed.js";

const REX_DB = join(process.env.HOME || '~', '.claude', 'rex', 'memory', 'rex.sqlite')
const DB_PATH = existsSync(REX_DB) ? REX_DB : join(import.meta.dirname, '..', 'db', 'rex.sqlite')
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const MAX_CHUNKS_PER_FILE = 50;
const CHUNK_SIZE = 1000;
const MAX_CHUNK_LENGTH = 2000;
const MIN_TEXT_LENGTH = 50;
const MIN_FINAL_CHUNK = 100;
const EMBED_RETRY_DELAY = 2000;
const EMBED_MAX_RETRIES = 3;
const SMART_INGEST = process.env.REX_SMART_INGEST !== "0";

const VALID_CATEGORIES = ["debug", "fix", "idea", "architecture", "pattern", "lesson", "config", "session"] as const;
type Category = (typeof VALID_CATEGORIES)[number];

// Preferred models for classify — smallest first (speed over quality in ingest)
const CLASSIFY_MODELS = ["qwen2.5:1.5b", "qwen3.5:4b", "qwen3.5:9b", "llama3.2", "mistral"];
// Larger models that are too slow for classify (> 2GB — avoid in auto mode)
const SLOW_MODELS = ["qwen3.5:9b", "qwen3:8b", "deepseek", "codestral"];

async function detectFastModel(): Promise<string> {
  if (process.env.REX_LLM_MODEL) return process.env.REX_LLM_MODEL;
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    const data = (await res.json()) as { models: Array<{ name: string }> };
    const available = data.models.map((m: any) => m.name as string);
    // Prefer smallest classify model
    for (const pref of CLASSIFY_MODELS) {
      const base = pref.split(":")[0];
      const match = available.find((a) => a.startsWith(base));
      if (match) return match;
    }
    // Fallback: any non-embed, non-slow model
    return available.find((a) => !a.includes("embed") && !SLOW_MODELS.some(s => a.includes(s))) || available[0] || "qwen2.5:1.5b";
  } catch {
    return "qwen2.5:1.5b";
  }
}

// ── Adaptive ingest context ─────────────────────────────

type IngestMode = 'smart' | 'fast' | 'bulk' | 'offline'

interface IngestContext {
  mode: IngestMode
  model: string | null
  maxPerRun: number
  pendingFiles: number
  totalChunks: number
  ollamaLatencyMs: number | null
}

const BASE_MAX_EMBED = parseInt(process.env.REX_MAX_EMBED_PER_RUN || '30', 10)

async function measureOllamaLatency(): Promise<number | null> {
  const start = Date.now()
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    return Date.now() - start
  } catch {
    return null
  }
}

async function detectIngestContext(): Promise<IngestContext> {
  // Count pending backlog
  let pendingFiles = 0
  let totalChunks = 0
  if (existsSync(PENDING_DIR)) {
    const files = readdirSync(PENDING_DIR).filter(f => f.endsWith('.json'))
    pendingFiles = files.length
    for (const f of files) {
      try {
        const chunks = JSON.parse(readFileSync(join(PENDING_DIR, f), 'utf-8'))
        totalChunks += Array.isArray(chunks) ? chunks.length : 0
      } catch { /* corrupt file — skip */ }
    }
  }

  // Explicit overrides take priority
  const override = process.env.REX_SMART_INGEST
  if (override === '0') {
    return { mode: 'fast', model: null, maxPerRun: BASE_MAX_EMBED, pendingFiles, totalChunks, ollamaLatencyMs: null }
  }
  if (override === '1') {
    const model = await detectFastModel()
    return { mode: 'smart', model, maxPerRun: BASE_MAX_EMBED, pendingFiles, totalChunks, ollamaLatencyMs: null }
  }

  // Dynamic detection: measure Ollama latency
  const ollamaLatencyMs = await measureOllamaLatency()

  if (ollamaLatencyMs === null) {
    // Ollama offline — queue only, no embed
    return { mode: 'offline', model: null, maxPerRun: 0, pendingFiles, totalChunks, ollamaLatencyMs: null }
  }

  // Critical backlog: > 2000 chunks → bulk mode, max throughput
  if (totalChunks > 2000) {
    return { mode: 'bulk', model: null, maxPerRun: Math.max(BASE_MAX_EMBED * 10, 500), pendingFiles, totalChunks, ollamaLatencyMs }
  }

  // Large backlog: > 500 chunks → fast embed-only, higher throughput
  if (totalChunks > 500) {
    return { mode: 'fast', model: null, maxPerRun: Math.max(BASE_MAX_EMBED * 5, 200), pendingFiles, totalChunks, ollamaLatencyMs }
  }

  // Fast Ollama (< 2s) → smart classify with smallest available model
  if (ollamaLatencyMs < 2000) {
    const model = await detectFastModel()
    return { mode: 'smart', model, maxPerRun: BASE_MAX_EMBED, pendingFiles, totalChunks, ollamaLatencyMs }
  }

  // Slow Ollama (2-10s) → embed-only to avoid blocking
  return { mode: 'fast', model: null, maxPerRun: BASE_MAX_EMBED, pendingFiles, totalChunks, ollamaLatencyMs }
}

async function classifyAndSummarize(chunk: string, resolvedModel?: string): Promise<{ category: Category; summary: string }> {
  const fallback = { category: "session" as Category, summary: chunk };
  try {
    const model = resolvedModel ?? await detectFastModel();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: `Classify this developer session chunk and summarize it. Output ONLY valid JSON, no markdown.\n\nCategories: debug, fix, idea, architecture, pattern, lesson, config, session\n\nChunk:\n${chunk.slice(0, 1500)}\n\nJSON output with "category" (one of the categories above) and "summary" (1-2 sentence summary of the key insight/action):`,
        stream: false,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return fallback;

    const data = (await res.json()) as { response: string };
    const rawResponse = data.response;
    let parsed: any = null;
    try { parsed = JSON.parse(rawResponse); } catch {}
    if (!parsed) {
      const fence = rawResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fence) { try { parsed = JSON.parse(fence[1].trim()); } catch {} }
    }
    if (!parsed) {
      const brace = rawResponse.match(/\{[\s\S]*\}/);  // greedy — handles nested objects
      if (brace) { try { parsed = JSON.parse(brace[0]); } catch {} }
    }
    if (!parsed) return fallback;
    const category = VALID_CATEGORIES.includes(parsed.category) ? parsed.category : "session";
    const summary = typeof parsed.summary === "string" && parsed.summary.length > 10 ? parsed.summary : chunk;

    return { category, summary };
  } catch {
    return fallback;
  }
}

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  const dbDir = join(import.meta.dirname, "..", "db");
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  _db = new Database(DB_PATH);
  sqliteVec.load(_db);

  _db.pragma("journal_mode = WAL");
  _db.defaultSafeIntegers(false);

  _db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      source TEXT,
      project TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS memory_vec USING vec0(
      embedding float[${EMBEDDING_DIM}]
    );

    CREATE TABLE IF NOT EXISTS ingest_log (
      file_path TEXT PRIMARY KEY,
      chunks_count INTEGER,
      file_size INTEGER DEFAULT 0,
      lines_ingested INTEGER DEFAULT 0,
      ingested_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Migration: add columns if missing (existing DBs)
  try {
    _db.exec(`ALTER TABLE ingest_log ADD COLUMN file_size INTEGER DEFAULT 0`);
  } catch { /* column already exists */ }
  try {
    _db.exec(`ALTER TABLE ingest_log ADD COLUMN lines_ingested INTEGER DEFAULT 0`);
  } catch { /* column already exists */ }

  return _db;
}

async function embedWithRetry(text: string): Promise<Float32Array> {
  for (let attempt = 1; attempt <= EMBED_MAX_RETRIES; attempt++) {
    try {
      return await embed(text);
    } catch (err) {
      if (attempt === EMBED_MAX_RETRIES) throw err;
      console.error(`  Embed attempt ${attempt} failed, retrying in ${EMBED_RETRY_DELAY}ms...`);
      await new Promise((r) => setTimeout(r, EMBED_RETRY_DELAY));
    }
  }
  throw new Error("Unreachable");
}

export async function learn(fact: string, category: string = "general", source?: string, project?: string): Promise<void> {
  const db = getDb();

  let embedding: Float32Array;
  try {
    embedding = await embedWithRetry(fact);
  } catch (err) {
    console.error(`  Skipping chunk (embedding failed): ${(err as Error).message}`);
    return;
  }

  try {
    const info = db.prepare("INSERT INTO memories (content, category, source, project) VALUES (?, ?, ?, ?)").run(fact, category, source ?? null, project ?? null);
    db.prepare("INSERT INTO memory_vec (rowid, embedding) VALUES (CAST(? AS INTEGER), ?)").run(Number(info.lastInsertRowid), embeddingToBuffer(embedding));
  } catch (err) {
    console.error(`  Skipping chunk (DB insert failed): ${(err as Error).message}`);
  }
}

export async function getContext(projectPath: string): Promise<string> {
  const db = getDb();
  const projectName = basename(projectPath);

  const projectMemories = db
    .prepare("SELECT content, category FROM memories WHERE project = ? ORDER BY created_at DESC LIMIT 20")
    .all(projectName) as Array<{ content: string; category: string }>;

  let semanticResults: Array<{ content: string; category: string; score: number }> = [];
  try {
    semanticResults = await (await import("./search.js")).search(projectName, 5);
  } catch {
    // Ollama might be down — degrade gracefully
  }

  const sections: string[] = [];

  if (projectMemories.length) {
    sections.push("## Project memories\n" + projectMemories.map((m) => `- [${m.category}] ${m.content}`).join("\n"));
  }

  if (semanticResults.length) {
    sections.push("## Related context\n" + semanticResults.map((r) => `- [${r.category}] (${r.score.toFixed(2)}) ${r.content}`).join("\n"));
  }

  return sections.join("\n\n") || "";
}

function extractTextFromMessage(msg: any): string {
  if (!msg?.message?.content) return "";
  if (typeof msg.message.content === "string") return msg.message.content;
  if (!Array.isArray(msg.message.content)) return "";
  return msg.message.content
    .filter((c: any) => c?.type === "text" && typeof c?.text === "string")
    .map((c: any) => c.text)
    .join("\n");
}

function chunkText(lines: string[]): string[] {
  const chunks: string[] = [];
  let current = "";

  for (const line of lines) {
    try {
      const msg = JSON.parse(line);
      if (msg.type !== "human" && msg.type !== "assistant") continue;

      const text = extractTextFromMessage(msg);
      if (text.length < MIN_TEXT_LENGTH) continue;

      current += text + "\n";
      if (current.length > CHUNK_SIZE) {
        chunks.push(current.slice(0, MAX_CHUNK_LENGTH));
        current = "";
      }
    } catch {
      // skip malformed JSON lines
    }
  }

  if (current.length > MIN_FINAL_CHUNK) {
    chunks.push(current.slice(0, MAX_CHUNK_LENGTH));
  }

  return chunks.slice(0, MAX_CHUNKS_PER_FILE);
}

const PENDING_DIR = join(process.env.HOME || '~', '.claude', 'rex', 'memory', 'pending')

async function savePending(chunks: Array<{ text: string; source: string; project: string }>) {
  if (!existsSync(PENDING_DIR)) mkdirSync(PENDING_DIR, { recursive: true });
  const filename = `pending-${Date.now()}.json`;
  writeFS(join(PENDING_DIR, filename), JSON.stringify(chunks, null, 2));
}

const EMBED_THROTTLE_MS = parseInt(process.env.REX_EMBED_THROTTLE_MS || '500', 10);

async function processPending(ctx?: IngestContext) {
  if (!existsSync(PENDING_DIR)) return;
  const files = readdirSync(PENDING_DIR).filter((f) => f.endsWith(".json"));
  if (files.length === 0) return;

  // Detect context if not provided
  const context = ctx ?? await detectIngestContext();
  const { mode, model, maxPerRun, totalChunks } = context;

  if (mode === 'offline') {
    console.log(`  Ollama offline — ${files.length} pending file(s) queued, will embed when Ollama is up.`);
    return;
  }

  const modeLabel = mode === 'smart' ? `smart (${model})` : mode;
  const estimatedMinutes = totalChunks > 0 && maxPerRun > 0
    ? Math.ceil((totalChunks / maxPerRun) * (EMBED_THROTTLE_MS / 1000 / 60))
    : 0;

  console.log(`  Processing ${files.length} file(s) · ${totalChunks} chunks · mode=${modeLabel} · max=${maxPerRun}/run${estimatedMinutes > 0 ? ` · ~${estimatedMinutes}min to clear` : ''}`);
  if (mode === 'bulk') console.warn(`  ⚠ Critical backlog detected (${totalChunks} chunks) — bulk mode active`);

  const cycleStart = Date.now();
  let totalEmbedded = 0;

  for (const file of files) {
    if (totalEmbedded >= maxPerRun) {
      const remaining = totalChunks - totalEmbedded;
      console.log(`  Reached ${maxPerRun} chunk limit — ${remaining} chunks will process next run.`);
      break;
    }

    const filePath = join(PENDING_DIR, file);
    try {
      const chunks: Array<{ text: string; source: string; project: string }> = JSON.parse(readFileSync(filePath, "utf-8"));
      let processed = 0;

      for (const chunk of chunks) {
        if (totalEmbedded >= maxPerRun) break;

        if (mode === 'smart' && model) {
          const { category, summary } = await classifyAndSummarize(chunk.text, model);
          await learn(summary, category, chunk.source, chunk.project);
        } else {
          await learn(chunk.text, "session", chunk.source, chunk.project);
        }
        processed++;
        totalEmbedded++;

        // Throttle to avoid CPU spikes (skip throttle in bulk mode)
        if (EMBED_THROTTLE_MS > 0 && mode !== 'bulk') {
          await new Promise((r) => setTimeout(r, EMBED_THROTTLE_MS));
        }
      }

      if (processed >= chunks.length) {
        unlinkSync(filePath);
      } else {
        const remaining = chunks.slice(processed);
        writeFS(filePath, JSON.stringify(remaining, null, 2));
      }
    } catch (err) {
      console.error(`  Error processing ${file}: ${(err as Error).message}`);
    }
  }

  const elapsed = ((Date.now() - cycleStart) / 1000).toFixed(1);
  const chunksPerMin = totalEmbedded > 0 ? Math.round(totalEmbedded / (parseFloat(elapsed) / 60)) : 0;
  if (totalEmbedded > 0) {
    console.log(`  Embedded ${totalEmbedded} chunks in ${elapsed}s (${chunksPerMin}/min). Remaining: ${Math.max(0, totalChunks - totalEmbedded)}`);
  }
}

const LOCK_FILE = join(process.env.HOME || '~', '.claude', 'rex', 'memory', 'ingest.lock');
const LOCK_STALE_MS = 10 * 60 * 1000; // 10 min — consider lock stale after this

function acquireLock(): boolean {
  try {
    const lockDir = join(process.env.HOME || '~', '.claude', 'rex', 'memory');
    if (!existsSync(lockDir)) mkdirSync(lockDir, { recursive: true });

    // Check for stale lock first
    if (existsSync(LOCK_FILE)) {
      const lockAge = Date.now() - statSync(LOCK_FILE).mtimeMs;
      if (lockAge < LOCK_STALE_MS) {
        console.log('Ingest already running (lock held). Skipping.');
        return false;
      }
      unlinkSync(LOCK_FILE);
    }

    // Atomic create — fails with EEXIST if another process created it first
    writeFS(LOCK_FILE, String(process.pid), { flag: 'wx' });
    return true;
  } catch (e: any) {
    if (e?.code === 'EEXIST') {
      console.log('Ingest already running (lock race). Skipping.');
    }
    return false;
  }
}

function releaseLock() {
  try { if (existsSync(LOCK_FILE)) unlinkSync(LOCK_FILE); } catch {}
}

async function ingestSessions() {
  if (!acquireLock()) return;

  try {
    // Detect adaptive context once — drives mode selection for processPending and new-session ingestion
    const ctx = await detectIngestContext();

    if (ctx.mode !== 'offline') {
      if (ctx.totalChunks > 0) {
        const latencyInfo = ctx.ollamaLatencyMs !== null ? ` (Ollama ${ctx.ollamaLatencyMs}ms)` : '';
        console.log(`Ingest: mode=${ctx.mode}${latencyInfo} · ${ctx.totalChunks} pending chunks · max=${ctx.maxPerRun}/run`);
      }
      await processPending(ctx);
    } else {
      console.log(`Ingest: Ollama offline — new sessions will be queued to pending/`);
    }

    const sessionsDir = join(process.env.HOME || "~", ".claude", "projects");
    if (!existsSync(sessionsDir)) {
      console.error("No sessions directory found at", sessionsDir);
      return;
    }

    const db = getDb();

    // Track already-processed files with size for delta detection
    const ingestLog = new Map<string, { chunks_count: number; file_size: number; lines_ingested: number }>(
      (db.prepare("SELECT file_path, chunks_count, COALESCE(file_size, 0) as file_size, COALESCE(lines_ingested, 0) as lines_ingested FROM ingest_log").all() as Array<{ file_path: string; chunks_count: number; file_size: number; lines_ingested: number }>)
        .map((r) => [r.file_path, { chunks_count: r.chunks_count, file_size: r.file_size, lines_ingested: r.lines_ingested }])
    );

    let totalIngested = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    let totalDelta = 0;

    let projectDirs: string[];
    try {
      projectDirs = readdirSync(sessionsDir).filter((d) => {
        try {
          return statSync(join(sessionsDir, d)).isDirectory();
        } catch {
          return false;
        }
      });
    } catch (err) {
      console.error("Cannot read sessions directory:", err);
      return;
    }

    for (const projectDir of projectDirs) {
      const projectPath = join(sessionsDir, projectDir);

      let files: string[];
      try {
        files = readdirSync(projectPath).filter((f) => f.endsWith(".jsonl"));
      } catch {
        continue;
      }

      for (const file of files) {
        const filePath = join(projectPath, file);

        try {
          const currentSize = statSync(filePath).size;
          const prev = ingestLog.get(filePath);

          // Skip if file hasn't grown since last ingest
          if (prev && prev.file_size >= currentSize) {
            totalSkipped++;
            continue;
          }

          const content = readFileSync(filePath, "utf-8");
          const allLines = content.split("\n").filter(Boolean);

          // Delta: skip lines already ingested
          const startLine = prev ? prev.lines_ingested : 0;
          const newLines = allLines.slice(startLine);

          if (newLines.length === 0) {
            // Update size tracking even if no new meaningful lines
            db.prepare("INSERT INTO ingest_log (file_path, chunks_count, file_size, lines_ingested) VALUES (?, ?, ?, ?) ON CONFLICT(file_path) DO UPDATE SET file_size=?, lines_ingested=?")
              .run(filePath, prev?.chunks_count ?? 0, currentSize, allLines.length, currentSize, allLines.length);
            totalSkipped++;
            continue;
          }

          const chunks = chunkText(newLines);

          if (chunks.length === 0) {
            db.prepare("INSERT INTO ingest_log (file_path, chunks_count, file_size, lines_ingested) VALUES (?, ?, ?, ?) ON CONFLICT(file_path) DO UPDATE SET file_size=?, lines_ingested=?")
              .run(filePath, prev?.chunks_count ?? 0, currentSize, allLines.length, currentSize, allLines.length);
            continue;
          }

          // Phase 1: ALWAYS save to pending/ first (instant, no CPU)
          // Phase 2: processPending() embeds lazily with throttling
          const pendingChunks = chunks.map(c => ({ text: c, source: filePath, project: projectDir }));
          await savePending(pendingChunks);
          const fileIngested = chunks.length;

          const totalChunks = (prev?.chunks_count ?? 0) + fileIngested;
          db.prepare("INSERT INTO ingest_log (file_path, chunks_count, file_size, lines_ingested) VALUES (?, ?, ?, ?) ON CONFLICT(file_path) DO UPDATE SET chunks_count=?, file_size=?, lines_ingested=?, ingested_at=datetime('now')")
            .run(filePath, totalChunks, currentSize, allLines.length, totalChunks, currentSize, allLines.length);
          totalIngested += fileIngested;

          if (fileIngested > 0) {
            const label = prev ? '(delta)' : '(new)';
            console.log(`  ${file} ${label}: ${fileIngested} chunks`);
            if (prev) totalDelta++;
          }
        } catch (err) {
          totalErrors++;
          console.error(`  Error ${file}: ${(err as Error).message}`);
        }
      }
    }

    console.log(`\nDone: ${totalIngested} ingested${totalDelta > 0 ? ` (${totalDelta} delta updates)` : ''}, ${totalSkipped} skipped, ${totalErrors} errors`);
  } finally {
    releaseLock();
  }
}

// Run CLI if called directly
if (process.argv[1]?.endsWith("ingest.ts") || process.argv[1]?.endsWith("ingest.js")) {
  ingestSessions().catch(console.error);
}
