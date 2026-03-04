import { search } from "./search.js";

const query = process.argv.slice(2).join(" ");
if (!query) {
  console.error("Usage: tsx src/cli-search.ts <query>");
  process.exit(1);
}

const results = await search(query, 5);
if (!results.length) {
  console.log("No results found.");
} else {
  for (const r of results) {
    console.log(`[${r.category}] (score: ${r.score.toFixed(3)})`);
    console.log(r.content);
    console.log("---");
  }
}
