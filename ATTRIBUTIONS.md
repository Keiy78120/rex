# ATTRIBUTIONS — Open Source Dependencies

REX is built on the shoulders of excellent open-source projects.
This file lists all third-party software used, with their licenses and upstream links.

---

## Runtime Libraries — Node.js / TypeScript

| Package | Version | License | Repository |
|---------|---------|---------|------------|
| **xstate** | ^5.28.0 | MIT | https://github.com/statelyai/xstate |
| **rxjs** | ^7.8.2 | Apache-2.0 | https://github.com/ReactiveX/rxjs |
| **effect** | ^3.19.19 | MIT | https://github.com/Effect-TS/effect |
| **better-sqlite3** | ^11.8.1 | MIT | https://github.com/WiseLibs/better-sqlite3 |
| **sqlite-vec** | ^0.1.6 | MIT | https://github.com/asg017/sqlite-vec |
| **openai** | ^6.27.0 | Apache-2.0 | https://github.com/openai/openai-node |
| **@ai-sdk/openai** | ^1.3.24 | Apache-2.0 | https://github.com/vercel/ai |
| **ai** (Vercel AI SDK) | ^6.0.116 | Apache-2.0 | https://github.com/vercel/ai |
| **@langchain/core** | ^1.1.31 | MIT | https://github.com/langchain-ai/langchainjs |
| **@langchain/langgraph** | ^1.2.1 | MIT | https://github.com/langchain-ai/langgraphjs |
| **simple-statistics** | ^7.8.8 | ISC | https://github.com/simple-statistics/simple-statistics |
| **fastembed** | ^2.1.0 | Apache-2.0 | https://github.com/Anush008/fastembed-js |
| **@modelcontextprotocol/sdk** | ^1.12.1 | MIT | https://github.com/modelcontextprotocol/typescript-sdk |
| **ink** | ^6.8.0 | MIT | https://github.com/vadimdemedes/ink |
| **react** | ^19.2.4 | MIT | https://github.com/facebook/react |
| **ws** | ^8.19.0 | MIT | https://github.com/websockets/ws |
| **zod** | ^3.23.0 | MIT | https://github.com/colinhacks/zod |
| **glob** | ^11.0.1 | ISC | https://github.com/isaacs/node-glob |
| **tsup** | ^8.5.1 | MIT | https://github.com/egoist/tsup |
| **typescript** | ^5.9.3 | Apache-2.0 | https://github.com/microsoft/TypeScript |

---

## Flutter / Dart Packages

| Package | Version | License | Repository |
|---------|---------|---------|------------|
| **provider** | ^6.1.2 | MIT | https://github.com/rrousselGit/provider |
| **macos_ui** | ^2.0.9 | MIT | https://github.com/macosui/macos_ui |
| **process_run** | ^1.3.0 | BSD-2-Clause | https://github.com/tekartik/process_run.dart |
| **xterm** | ^4.0.0 | MIT | https://github.com/nicowillis/flutter_xterm |
| **pty** | ^0.1.1 | MIT | https://github.com/nicowillis/flutter_pty |
| **url_launcher** | ^6.3.1 | BSD-3-Clause | https://github.com/flutter/packages/tree/main/packages/url_launcher |
| **shared_preferences** | ^2.3.4 | BSD-3-Clause | https://github.com/flutter/packages/tree/main/packages/shared_preferences |
| **cupertino_icons** | ^1.0.8 | MIT | https://github.com/flutter/cupertino_icons |
| **intl** | ^0.19.0 | BSD-3-Clause | https://github.com/dart-lang/i18n |

---

## External Tools & Services (system-level)

These tools are invoked at runtime via CLI or HTTP — they are not bundled in REX.

| Tool | License | Repository | Usage in REX |
|------|---------|------------|--------------|
| **Ollama** | MIT | https://github.com/ollama/ollama | Local LLM inference (Qwen, Llama, nomic-embed) |
| **LiteLLM** | MIT | https://github.com/BerriAI/litellm | Unified LLM gateway, provider routing |
| **ActivityWatch** | MPL-2.0 | https://github.com/ActivityWatch/activitywatch | App usage tracking, productivity signals |
| **Hammerspoon** | MIT | https://github.com/Hammerspoon/hammerspoon | macOS automation, window/activity logging |
| **Whisper** (OpenAI) | MIT | https://github.com/openai/whisper | Speech-to-text in meeting module |
| **whisper.cpp** | MIT | https://github.com/ggerganov/whisper.cpp | Local Whisper inference (macOS) |
| **mcp-scan** (Invariant Labs) | Apache-2.0 | https://github.com/invariantlabs-ai/mcp-scan | MCP server security scanning |
| **PM2** | AGPL-3.0 | https://github.com/Unitech/pm2 | Process manager for REX daemon |

---

## Provider APIs (external, not OSS)

These are commercial/hosted APIs with their own ToS — listed for transparency.

| Provider | Free Tier | Docs |
|----------|-----------|------|
| **Anthropic Claude** (claude-haiku, sonnet, opus) | No | https://docs.anthropic.com |
| **Groq** (llama-3.3-70b-versatile) | Yes | https://console.groq.com/docs |
| **OpenRouter** | Yes (some models) | https://openrouter.ai/docs |
| **Telegram Bot API** | Yes | https://core.telegram.org/bots/api |
| **GitHub API** | Yes | https://docs.github.com/en/rest |
| **Smithery Registry** | Yes | https://smithery.ai |

---

## Routing / Mesh Concepts

The REX routing architecture draws inspiration from:

| Concept | Source |
|---------|--------|
| **9router / archgw** pattern | https://github.com/Portkey-AI/gateway (proxy pattern) |
| **Relay document** pattern | Internal REX design (sequential multi-model enrichment) |
| **Dijkstra fleet routing** | Standard graph shortest-path algorithm |
| **graphlib** | MIT — https://github.com/dagrejs/graphlib (used for fleet topology) |

---

## Vector Embeddings

| Model | Source | License |
|-------|--------|---------|
| **nomic-embed-text** | Ollama / Nomic AI | Apache-2.0 — https://huggingface.co/nomic-ai/nomic-embed-text-v1.5 |
| **fastembed ONNX models** | Qdrant | Apache-2.0 — https://huggingface.co/Qdrant |

---

## License Summary

REX itself is proprietary software © D-Studio (Kevin).
All dependencies listed above retain their original licenses.
Redistributed binaries (if any) must comply with each dependency's license.

For the full text of each license, refer to the respective repository's `LICENSE` file.
