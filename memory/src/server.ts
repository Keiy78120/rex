import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { search } from "./search.js";
import { learn, getContext } from "./ingest.js";

const server = new McpServer({
  name: "rex-memory",
  version: "1.0.0",
});

server.tool(
  "rex_search",
  "Search past sessions and learned facts semantically",
  { query: z.string().describe("Natural language search query"), limit: z.number().optional().default(10) },
  async ({ query, limit }) => {
    const results = await search(query, limit);
    return {
      content: [
        {
          type: "text" as const,
          text: results.length
            ? results.map((r) => `[${r.category}] (score: ${r.score.toFixed(3)})\n${r.content}`).join("\n---\n")
            : "No relevant memories found.",
        },
      ],
    };
  }
);

server.tool(
  "rex_learn",
  "Memorize a fact, pattern, or lesson learned",
  {
    fact: z.string().describe("The fact or pattern to remember"),
    category: z.string().optional().default("general").describe("Category: pattern, debug, preference, architecture, lesson"),
  },
  async ({ fact, category }) => {
    await learn(fact, category);
    return {
      content: [{ type: "text" as const, text: `Learned: [${category}] ${fact.slice(0, 80)}...` }],
    };
  }
);

server.tool(
  "rex_context",
  "Get relevant context for the current project",
  {
    project_path: z.string().describe("Absolute path to the project directory"),
  },
  async ({ project_path }) => {
    const context = await getContext(project_path);
    return {
      content: [{ type: "text" as const, text: context || "No context found for this project." }],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("REX Memory MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
