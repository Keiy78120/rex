# REX Action Plan

## Core Architecture

REX is the unified orchestrator that sits above Claude Code, managing:
- Context profiles & intent detection  
- Resource mesh (nodes, MCPs, models)
- Token economy & caching
- Session lifecycle & kill/relaunch
- Fleet orchestration

### Entry Points

- **`rex`** (default) → intent detection → profile selection → launch Claude Code
- **`rex setup`** → discovery wizard → configure mesh → initial ingest → wow moment
- **`rex kill`** → dump session state → kill Claude → preserve context
- **`rex relaunch`** → dump + kill + re-detect intent → respawn with new profile
- **`rex mesh`** → show node mesh status

### Key Files

- **`rex-launcher.ts`** - Single entry point, profile writer, session manager
- **`node-mesh.ts`** - Node capability detection, task routing, cross-node delegation
- **`setup-wizard.ts`** - Discovery, configuration, initial ingest, wizard UI
- **`orchestrator.ts`** - LLM router for internal REX tasks (self-improve, categorize, etc)
- **`semantic-cache.ts`** - Aggressive caching before LLM calls
- **`daemon.ts`** - Background service for node mesh registration & monitoring

## 1. Intent Detection & Profiles

**Intent Detection**
- Signal-based detection in `project-intent.ts`
- File patterns, git state, recent changes, memory context
- Maps to profiles: feature, bug-fix, refactor, infra, docs, explore, discussion, new-project

**Context Profiles**
- Each profile defines guards, MCPs, skills, model hints
- Guards run via hooks (PreToolUse, PostToolUse)
- MCPs loaded dynamically at session start (lazy loading)
- Skills injected in preload context

## 2. Resource Mesh

**Node Discovery**
- Auto-detect capabilities (claude-code, ollama, browser, voice, gpu, etc)
- Register with hub via `/nodes/register`
- Health check + heartbeat every 60s

**Task Routing**
- Route tasks to best available node based on capabilities
- Fallback chain: preferred → capability match → lowest latency → hub → queue
- Task delegation via HTTP between nodes

## 3. Token Economy

**Rules**
- Script before LLM always
- Haiku for scan/read/classify, Sonnet for code, Opus for final review
- Batch reads with Promise.all, never sequential
- Aggressive semantic cache before LLM calls
- Preload injects max 5 facts, not full memory
- Context compaction when >70% used

## 4. Session Lifecycle

**rex-launcher Flow**
1. Detect intent → select profile
2. Check recovery state from previous kill
3. Write ~/.claude/settings.json with dynamic MCPs + guards + hooks
4. Spawn Claude Code as subprocess
5. Monitor PID → dump state on exit

**Recovery State**
- `recovery-state.json` on session kill
- Contains: intent, profile, cwd, git diff, memory context, last messages, pending files
- Injected at SessionStart for zero context loss

## 5. REX Uses REX

**Internal LLM Calls**
- ALL internal REX calls go through `orchestrator.ts`
- Chain: semantic cache → Ollama local → free tier → subscription → pay
- Never direct API imports in REX internal code
- Self-improve, categorize, gateway replies = Ollama/Haiku via router

## 6. Setup Wizard

**Flow**
1. Discovery parallel (30s, scripts only)
   - Claude accounts, API keys, Ollama, repos, hardware, Tailscale
2. Organization (use available APIs once)
   - Ingest sessions, detect intents, setup mesh, install guards + MCPs
3. Wizard CLI/UI display
   - Show "wow moment" — what REX found

**Output**
- ✓ 12 repos indexed, ✓ 8 guards, ✓ 4 MCPs, ✓ Hub, ✓ Fleet → ready!

## 7. Missing Critical Components

**Missing Files**
- `orchestrator.ts` - LLM router for internal REX tasks
- `semantic-cache.ts` - Aggressive caching system
- `daemon.ts` - Node mesh registration service
- `hub.ts` - API endpoints for mesh registration & status
- `event-journal.ts` - VPS-compatible session logging
- `auth-mesh.ts` - Node-to-node authentication & security

**Authentication Mesh**
- OpenClaw model: Gateway auth with tokens, Tailscale serve for HTTPS
- LiteLLM model: Provider fallbacks, cooldowns, load balancing
- REX adaptation: JWT tokens for inter-node auth, TLS optional, trust via Tailscale
- Fallback chain: local Ollama → free tier → subscription → alert if quota exceeded

**Error Handling**
- Node offline → task retry on available node or queue
- API failure → automatic fallback to next provider
- Session crash → recovery state injection on restart
- Mesh partition → hub coordination when available

## 8. Integration Points

**CLI Commands**
- `rex` → launchRex() with detected intent
- `rex setup` → runSetupWizard()
- `rex kill` → killSession()
- `rex relaunch` → killAndRelaunch() 
- `rex mesh` → printMeshStatus()
- `rex doctor` → validate all components

**Gateway Integration**
- Telegram messages routed through hub → best node
- Gateway uses orchestrator for responses (not direct LLM)
- Session state preserved across gateway restarts

**Account Pool**
- Multi-account Claude rotation via `account-pool.ts`
- Codex as background worker via `runWithCodex()`
- Model selection based on task type & budget

---

**Status**: Core architecture defined, 4 core files pushed, 4 missing critical files needed
**Next**: Claude Code to wire existing files, then implement missing components