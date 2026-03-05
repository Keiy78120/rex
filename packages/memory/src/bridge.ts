/**
 * CLI bridge for desktop app / CLI -> @rex/memory communication.
 * Called via: node --import tsx/esm packages/memory/src/bridge.ts <command> [args...]
 *
 * Commands:
 *   search <query> [limit]   — semantic search
 *   learn <fact> [category]  — store a memory
 *   status                   — memory stats
 */

import { search } from "./search.js";
import { learn, getDb } from "./ingest.js";

const [command, ...args] = process.argv.slice(2);

async function main() {
  switch (command) {
    case "search": {
      const query = args[0];
      if (!query) {
        console.error("Usage: bridge search <query> [limit]");
        process.exit(1);
      }
      const limit = parseInt(args[1] || "10", 10);
      const results = await search(query, limit);
      console.log(JSON.stringify(results));
      break;
    }
    case "learn": {
      const fact = args[0];
      if (!fact) {
        console.error("Usage: bridge learn <fact> [category]");
        process.exit(1);
      }
      const category = args[1] || "general";
      await learn(fact, category);
      console.log(JSON.stringify({ ok: true }));
      break;
    }
    case "status": {
      const db = getDb();
      const count = db.prepare("SELECT COUNT(*) as c FROM memories").get() as { c: number };
      const categories = db
        .prepare("SELECT category, COUNT(*) as c FROM memories GROUP BY category ORDER BY c DESC")
        .all() as { category: string; c: number }[];
      console.log(JSON.stringify({ total: count.c, categories }));
      break;
    }
    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
