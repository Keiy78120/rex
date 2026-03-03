import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join, basename } from "path";
import { embed, embeddingToBuffer, EMBEDDING_DIM } from "./embed.js";

const DB_PATH = join(import.meta.dirname, "..", "db", "rex.sqlite");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  _db = new Database(DB_PATH);
  sqliteVec.load(_db);

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
  `);

  return _db;
}

export async function learn(fact: string, category: string = "general", source?: string, project?: string): Promise<void> {
  const db = getDb();
  const embedding = await embed(fact);

  const info = db.prepare("INSERT INTO memories (content, category, source, project) VALUES (?, ?, ?, ?)").run(fact, category, source ?? null, project ?? null);

  db.prepare("INSERT INTO memory_vec (rowid, embedding) VALUES (?, ?)").run(info.lastInsertRowid, embeddingToBuffer(embedding));
}

export async function getContext(projectPath: string): Promise<string> {
  const db = getDb();
  const projectName = basename(projectPath);

  // Get project-specific memories
  const projectMemories = db
    .prepare("SELECT content, category FROM memories WHERE project = ? ORDER BY created_at DESC LIMIT 20")
    .all(projectName) as Array<{ content: string; category: string }>;

  // Also do a semantic search with project name
  const semanticResults = await (await import("./search.js")).search(projectName, 5);

  const sections: string[] = [];

  if (projectMemories.length) {
    sections.push("## Project memories\n" + projectMemories.map((m) => `- [${m.category}] ${m.content}`).join("\n"));
  }

  if (semanticResults.length) {
    sections.push("## Related context\n" + semanticResults.map((r) => `- [${r.category}] (${r.score.toFixed(2)}) ${r.content}`).join("\n"));
  }

  return sections.join("\n\n") || "";
}

// CLI: ingest JSONL sessions
async function ingestSessions() {
  const sessionsDir = join(process.env.HOME || "~", ".claude", "projects");
  if (!existsSync(sessionsDir)) {
    console.error("No sessions directory found at", sessionsDir);
    return;
  }

  const db = getDb();
  const existingSources = new Set(
    (db.prepare("SELECT DISTINCT source FROM memories WHERE source IS NOT NULL").all() as Array<{ source: string }>).map((r) => r.source)
  );

  let totalIngested = 0;

  for (const projectDir of readdirSync(sessionsDir)) {
    const projectPath = join(sessionsDir, projectDir);
    const files = readdirSync(projectPath).filter((f) => f.endsWith(".jsonl"));

    for (const file of files) {
      const filePath = join(projectPath, file);
      if (existingSources.has(filePath)) continue;

      try {
        const content = readFileSync(filePath, "utf-8");
        const lines = content.split("\n").filter(Boolean);

        const chunks: string[] = [];
        let currentChunk = "";

        for (const line of lines) {
          try {
            const msg = JSON.parse(line);
            if (msg.type === "human" || msg.type === "assistant") {
              const text = typeof msg.message?.content === "string" ? msg.message.content : msg.message?.content?.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n") || "";

              if (text.length > 50) {
                currentChunk += text + "\n";
                if (currentChunk.length > 1000) {
                  chunks.push(currentChunk.slice(0, 2000));
                  currentChunk = "";
                }
              }
            }
          } catch {
            // skip malformed lines
          }
        }
        if (currentChunk.length > 100) chunks.push(currentChunk.slice(0, 2000));

        for (const chunk of chunks.slice(0, 50)) {
          await learn(chunk, "session", filePath, projectDir);
          totalIngested++;
        }

        console.log(`Ingested ${chunks.length} chunks from ${file}`);
      } catch (err) {
        console.error(`Error processing ${file}:`, err);
      }
    }
  }

  console.log(`Total ingested: ${totalIngested} chunks`);
}

// Run CLI if called directly
if (process.argv[1]?.endsWith("ingest.ts") || process.argv[1]?.endsWith("ingest.js")) {
  ingestSessions().catch(console.error);
}
