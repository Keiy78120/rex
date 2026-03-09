import { search } from "./search.js";
import { hybridSearch } from "./hybrid-search.js";

const args = process.argv.slice(2);
const useHybrid = args.includes("--hybrid");
const jsonOut = args.includes("--json");
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1] ?? "5", 10) : 5;
const query = args.filter((a) => !a.startsWith("--")).join(" ");

if (!query) {
  console.error("Usage: tsx src/cli-search.ts [--hybrid] [--json] [--limit=N] <query>");
  process.exit(1);
}

if (useHybrid) {
  const results = await hybridSearch(query, limit);
  if (jsonOut) {
    console.log(JSON.stringify({ results, mode: "hybrid" }, null, 2));
  } else if (!results.length) {
    console.log("No results found.");
  } else {
    for (const r of results) {
      console.log(`[${r.category}] rrf=${r.rrfScore.toFixed(4)} bm25=#${r.bm25Rank ?? "-"} vec=#${r.vectorRank ?? "-"}`);
      console.log(r.content);
      console.log("---");
    }
  }
} else {
  const results = await search(query, limit);
  if (jsonOut) {
    console.log(JSON.stringify({ results, mode: "vector" }, null, 2));
  } else if (!results.length) {
    console.log("No results found.");
  } else {
    for (const r of results) {
      console.log(`[${r.category}] (score: ${r.score.toFixed(3)})`);
      console.log(r.content);
      console.log("---");
    }
  }
}
