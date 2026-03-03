import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import { join, basename } from "path";
import { embed, embeddingToBuffer, EMBEDDING_DIM } from "./embed.js";

const DB_PATH = join(import.meta.dirname, "..", "db", "rex.sqlite");
const MAX_CHUNKS_PER_FILE = 50;
const CHUNK_SIZE = 1000;
const MAX_CHUNK_LENGTH = 2000;
const MIN_TEXT_LENGTH = 50;
const MIN_FINAL_CHUNK = 100;
const EMBED_RETRY_DELAY = 2000;
const EMBED_MAX_RETRIES = 3;

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  const dbDir = join(import.meta.dirname, "..", "db");
  if (!existsSync(dbDir)) {
    const { mkdirSync } = require("fs");
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
      ingested_at TEXT DEFAULT (datetime('now'))
    );
  `);

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

async function checkOllama(): Promise<boolean> {
  try {
    const res = await fetch(`${process.env.OLLAMA_URL || "http://localhost:11434"}/api/tags`);
    return res.ok;
  } catch {
    return false;
  }
}

async function ingestSessions() {
  // Pre-flight: check Ollama
  if (!(await checkOllama())) {
    console.error("ERROR: Ollama is not running. Start it with: ollama serve");
    process.exit(1);
  }

  const sessionsDir = join(process.env.HOME || "~", ".claude", "projects");
  if (!existsSync(sessionsDir)) {
    console.error("No sessions directory found at", sessionsDir);
    return;
  }

  const db = getDb();

  // Use ingest_log to track already-processed files (more reliable than source column)
  const alreadyIngested = new Set(
    (db.prepare("SELECT file_path FROM ingest_log").all() as Array<{ file_path: string }>).map((r) => r.file_path)
  );

  let totalIngested = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

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

      if (alreadyIngested.has(filePath)) {
        totalSkipped++;
        continue;
      }

      try {
        const content = readFileSync(filePath, "utf-8");
        const lines = content.split("\n").filter(Boolean);
        const chunks = chunkText(lines);

        if (chunks.length === 0) {
          // Mark as processed even if empty (no need to re-parse)
          db.prepare("INSERT OR IGNORE INTO ingest_log (file_path, chunks_count) VALUES (?, 0)").run(filePath);
          continue;
        }

        let fileIngested = 0;
        for (const chunk of chunks) {
          await learn(chunk, "session", filePath, projectDir);
          fileIngested++;
        }

        db.prepare("INSERT OR IGNORE INTO ingest_log (file_path, chunks_count) VALUES (?, ?)").run(filePath, fileIngested);
        totalIngested += fileIngested;

        if (fileIngested > 0) {
          console.log(`  ${file}: ${fileIngested} chunks`);
        }
      } catch (err) {
        totalErrors++;
        console.error(`  Error ${file}: ${(err as Error).message}`);
      }
    }
  }

  console.log(`\nDone: ${totalIngested} ingested, ${totalSkipped} skipped (already done), ${totalErrors} errors`);
}

// Run CLI if called directly
if (process.argv[1]?.endsWith("ingest.ts") || process.argv[1]?.endsWith("ingest.js")) {
  ingestSessions().catch(console.error);
}
