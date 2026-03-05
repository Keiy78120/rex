import { useEffect, useState, useCallback } from "react";
import "./App.css";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

interface CheckResult {
  name: string;
  status: "pass" | "fail" | "warn";
  message: string;
}

interface CheckGroup {
  name: string;
  icon: string;
  results: CheckResult[];
}

interface HealthReport {
  groups: CheckGroup[];
  status: "healthy" | "degraded" | "broken";
  timestamp: string;
  version: string;
}

interface VoiceStatus {
  recording: boolean;
  tiny_model: boolean;
  large_model: boolean;
  models_dir: string;
}

interface AudioLoggerStatus {
  capturing: boolean;
  recordings_dir: string;
  recordings_count: number;
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === "pass" ? "default" : status === "warn" ? "secondary" : "destructive";
  const label = status === "pass" ? "OK" : status === "warn" ? "Warn" : "Fail";
  return (
    <Badge variant={variant} className="text-[9px] h-4 px-1.5 font-mono">
      {label}
    </Badge>
  );
}

function CheckSection({ group }: { group: CheckGroup }) {
  const [open, setOpen] = useState(false);
  const passed = group.results.filter((r) => r.status === "pass").length;
  const total = group.results.length;

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-accent/50 transition-colors text-left rounded-md"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs opacity-60">{group.icon}</span>
          <span className="text-xs font-medium text-foreground/80">{group.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground font-mono">
            {passed}/{total}
          </span>
          {passed === total ? (
            <Badge variant="default" className="text-[9px] h-4 px-1.5 bg-emerald-500/20 text-emerald-400 border-0">OK</Badge>
          ) : (
            <Badge variant="secondary" className="text-[9px] h-4 px-1.5">!</Badge>
          )}
        </div>
      </button>
      {open && (
        <div className="px-3 pb-2 space-y-1">
          {group.results.map((r, i) => (
            <div key={i} className="flex items-center justify-between py-1 px-2 rounded text-xs">
              <div className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${
                  r.status === "pass" ? "bg-emerald-400" : r.status === "warn" ? "bg-amber-400" : "bg-red-400"
                }`} />
                <span className="text-muted-foreground">{r.name}</span>
              </div>
              <StatusBadge status={r.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HealthTab({ report, loading, onRefresh }: { report: HealthReport | null; loading: boolean; onRefresh: () => void }) {
  const allResults = report?.groups.flatMap((g) => g.results) ?? [];
  const passed = allResults.filter((r) => r.status === "pass").length;
  const total = allResults.length;

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge
            variant={report?.status === "healthy" ? "default" : "destructive"}
            className={`text-[10px] ${
              report?.status === "healthy"
                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20"
                : report?.status === "degraded"
                  ? "bg-amber-500/15 text-amber-400 border-amber-500/20"
                  : "bg-red-500/15 text-red-400 border-red-500/20"
            }`}
          >
            {report?.status?.toUpperCase() ?? "..."}
          </Badge>
          <span className="text-[10px] text-muted-foreground font-mono">{passed}/{total}</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground"
          onClick={onRefresh}
          disabled={loading}
        >
          <svg className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </Button>
      </div>
      <Separator />
      <div className="flex-1 overflow-y-auto p-1">
        {loading && !report ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-4 h-4 border-2 border-muted border-t-foreground/30 rounded-full animate-spin" />
          </div>
        ) : (
          report?.groups.map((group, i) => (
            <CheckSection key={i} group={group} />
          ))
        )}
      </div>
    </div>
  );
}

function VoiceTab({ isRecording, lastTranscript, voiceStatus }: {
  isRecording: boolean;
  lastTranscript: string;
  voiceStatus: VoiceStatus | null;
}) {
  return (
    <div className="p-3 space-y-3">
      <Card className="border-border/50 bg-card/50">
        <CardContent className="p-3">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300 ${
              isRecording
                ? "bg-red-500/20 ring-2 ring-red-500/40 animate-pulse"
                : "bg-muted"
            }`}>
              <svg className={`w-4 h-4 ${isRecording ? "text-red-400" : "text-muted-foreground"}`} fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              </svg>
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium">
                {isRecording ? "Recording..." : "Voice Ready"}
              </div>
              <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                <kbd className="px-1 py-0.5 rounded bg-muted text-[9px]">⌥</kbd>
                {" + "}
                <kbd className="px-1 py-0.5 rounded bg-muted text-[9px]">Space</kbd>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {lastTranscript && (
        <Card className="border-border/50 bg-card/50">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
              Last transcript
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-1">
            <p className="text-xs text-foreground/70 leading-relaxed">{lastTranscript}</p>
          </CardContent>
        </Card>
      )}

      <Card className="border-border/50 bg-card/50">
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
            Models
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-1 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Tiny (fast)</span>
            <Badge
              variant="outline"
              className={`text-[9px] h-4 ${
                voiceStatus?.tiny_model
                  ? "text-emerald-400 border-emerald-500/30"
                  : "text-red-400 border-red-500/30"
              }`}
            >
              {voiceStatus?.tiny_model ? "ready" : "missing"}
            </Badge>
          </div>
          <Separator className="opacity-30" />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Large (accurate)</span>
            <Badge
              variant="outline"
              className={`text-[9px] h-4 ${
                voiceStatus?.large_model
                  ? "text-emerald-400 border-emerald-500/30"
                  : "text-muted-foreground border-border/50"
              }`}
            >
              {voiceStatus?.large_model ? "ready" : "optional"}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AudioTab({ audioStatus, onToggle, error }: {
  audioStatus: AudioLoggerStatus | null;
  onToggle: () => void;
  error: string | null;
}) {
  const capturing = audioStatus?.capturing ?? false;

  return (
    <div className="p-3 space-y-3">
      <Card className="border-border/50 bg-card/50">
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300 ${
                capturing
                  ? "bg-cyan-500/20 ring-2 ring-cyan-500/40"
                  : "bg-muted"
              }`}>
                <svg className={`w-4 h-4 ${capturing ? "text-cyan-400" : "text-muted-foreground"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                </svg>
              </div>
              <div>
                <div className="text-sm font-medium">Audio Logger</div>
                <div className="text-[10px] text-muted-foreground">System audio capture</div>
              </div>
            </div>
            <Switch checked={capturing} onCheckedChange={onToggle} />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card/50">
        <CardContent className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Status</span>
            <Badge
              variant="outline"
              className={`text-[9px] h-4 ${
                capturing ? "text-cyan-400 border-cyan-500/30" : "text-muted-foreground border-border/50"
              }`}
            >
              {capturing ? "recording" : "idle"}
            </Badge>
          </div>
          <Separator className="opacity-30" />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Recordings</span>
            <span className="text-xs font-mono text-muted-foreground">{audioStatus?.recordings_count ?? 0}</span>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="p-3">
            <p className="text-xs text-red-400">{error}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface MemoryResult {
  content: string;
  category: string;
  score: number;
  created_at: string;
}

interface MemoryStats {
  total: number;
  categories: { category: string; c: number }[];
}

function MemoryTab() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MemoryResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const raw = await invoke<string>("memory_status");
      setStats(JSON.parse(raw));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    setError(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const raw = await invoke<string>("memory_search", { query: q, limit: 20 });
      const parsed = JSON.parse(raw);
      setResults(Array.isArray(parsed) ? parsed : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const t = setTimeout(() => doSearch(query), 400);
    return () => clearTimeout(t);
  }, [query, doSearch]);

  const categoryColor = (cat: string) => {
    switch (cat) {
      case "voice": return "text-purple-400 border-purple-500/30";
      case "session": return "text-blue-400 border-blue-500/30";
      case "pattern": return "text-amber-400 border-amber-500/30";
      case "debug": return "text-red-400 border-red-500/30";
      case "lesson": return "text-emerald-400 border-emerald-500/30";
      default: return "text-muted-foreground border-border/50";
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="px-3 py-2">
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <Input
            placeholder="Search memories..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-7 text-xs pl-8 bg-muted/50 border-border/50"
          />
          {searching && (
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 border border-muted border-t-foreground/30 rounded-full animate-spin" />
          )}
        </div>
      </div>
      <Separator />

      {/* Results or stats */}
      <ScrollArea className="flex-1">
        {error && (
          <div className="px-3 py-2">
            <Card className="border-red-500/30 bg-red-500/5">
              <CardContent className="p-3">
                <p className="text-[10px] text-red-400">{error}</p>
                <p className="text-[9px] text-muted-foreground mt-1">Is Ollama running? (ollama serve)</p>
              </CardContent>
            </Card>
          </div>
        )}

        {results.length > 0 ? (
          <div className="p-2 space-y-1.5">
            {results.map((r, i) => (
              <Card key={i} className="border-border/30 bg-card/50">
                <CardContent className="p-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Badge variant="outline" className={`text-[8px] h-3.5 px-1 ${categoryColor(r.category)}`}>
                      {r.category}
                    </Badge>
                    <span className="text-[8px] text-muted-foreground font-mono">
                      {(r.score * 100).toFixed(0)}%
                    </span>
                    <span className="text-[8px] text-muted-foreground ml-auto">
                      {r.created_at?.split("T")[0] ?? ""}
                    </span>
                  </div>
                  <p className="text-[11px] text-foreground/80 leading-relaxed line-clamp-3">
                    {r.content}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : !query.trim() && stats ? (
          <div className="p-3 space-y-3">
            <Card className="border-border/50 bg-card/50">
              <CardHeader className="p-3 pb-1">
                <CardTitle className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                  Memory Store
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-1 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Total memories</span>
                  <span className="text-xs font-mono font-medium">{stats.total}</span>
                </div>
                {stats.categories.map((cat, i) => (
                  <div key={i}>
                    <Separator className="opacity-30" />
                    <div className="flex items-center justify-between py-1">
                      <Badge variant="outline" className={`text-[8px] h-3.5 px-1 ${categoryColor(cat.category)}`}>
                        {cat.category}
                      </Badge>
                      <span className="text-[10px] font-mono text-muted-foreground">{cat.c}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/50">
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Semantic search powered by Ollama embeddings (nomic-embed-text).
                  Voice transcriptions are auto-saved.
                </p>
              </CardContent>
            </Card>
          </div>
        ) : !query.trim() ? (
          <div className="flex items-center justify-center py-10">
            <p className="text-[10px] text-muted-foreground">Type to search memories</p>
          </div>
        ) : null}
      </ScrollArea>
    </div>
  );
}

function OptimizeTab() {
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [applyResult, setApplyResult] = useState<{ before: number; after: number; saved: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runAnalyze = useCallback(async () => {
    setAnalyzing(true);
    setError(null);
    setApplyResult(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<string>("optimize_analyze");
      setAnalysis(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAnalyzing(false);
    }
  }, []);

  const runApply = useCallback(async () => {
    setApplying(true);
    setError(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const raw = await invoke<string>("optimize_apply");
      const result = JSON.parse(raw);
      setApplyResult(result);
      setAnalysis(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  }, []);

  return (
    <div className="p-3 space-y-3">
      <Card className="border-border/50 bg-card/50">
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
            CLAUDE.md Optimizer
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-1 space-y-2">
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Uses local LLM to analyze and optimize your CLAUDE.md for token efficiency.
          </p>
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-[11px] flex-1" onClick={runAnalyze} disabled={analyzing || applying}>
              {analyzing ? "Analyzing..." : "Analyze"}
            </Button>
            {analysis && (
              <Button size="sm" variant="secondary" className="h-7 text-[11px] flex-1" onClick={runApply} disabled={applying}>
                {applying ? "Applying..." : "Apply"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="p-3">
            <p className="text-[10px] text-red-400">{error}</p>
          </CardContent>
        </Card>
      )}

      {analysis && (
        <Card className="border-border/50 bg-card/50">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
              Suggestions
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-1">
            <ScrollArea className="max-h-60">
              <pre className="text-[10px] text-foreground/70 whitespace-pre-wrap leading-relaxed font-mono">{analysis}</pre>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {applyResult && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Before</span>
              <span className="text-xs font-mono">~{applyResult.before} tokens</span>
            </div>
            <Separator className="opacity-30" />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">After</span>
              <span className="text-xs font-mono">~{applyResult.after} tokens</span>
            </div>
            <Separator className="opacity-30" />
            <div className="flex items-center justify-between">
              <span className="text-xs text-emerald-400 font-medium">Saved</span>
              <span className="text-xs font-mono text-emerald-400">~{applyResult.saved} tokens</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function OllamaStatus() {
  const [status, setStatus] = useState<{ running: boolean; models: string[] } | null>(null);
  const [setupRunning, setSetupRunning] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const raw = await invoke<string>("ollama_status");
      setStatus(JSON.parse(raw));
    } catch {
      setStatus({ running: false, models: [] });
    }
  }, []);

  const runSetup = useCallback(async () => {
    setSetupRunning(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("run_setup");
      await refresh();
    } catch {} finally {
      setSetupRunning(false);
    }
  }, [refresh]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <Card className="border-border/50 bg-card/50">
      <CardHeader className="p-3 pb-1">
        <CardTitle className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
          Ollama
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-1 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Status</span>
          <Badge variant="outline" className={`text-[9px] h-4 ${status?.running ? "text-emerald-400 border-emerald-500/30" : "text-red-400 border-red-500/30"}`}>
            {status?.running ? "running" : "stopped"}
          </Badge>
        </div>
        {status?.models && status.models.length > 0 && (
          <>
            <Separator className="opacity-30" />
            <div className="space-y-1">
              <span className="text-[10px] text-muted-foreground">Models</span>
              {status.models.map((m, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-foreground/70">{m}</span>
                </div>
              ))}
            </div>
          </>
        )}
        {!status?.running && (
          <>
            <Separator className="opacity-30" />
            <Button size="sm" className="w-full h-7 text-[11px]" onClick={runSetup} disabled={setupRunning}>
              {setupRunning ? "Setting up..." : "Run Setup"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SettingsTab() {
  const [checking, setChecking] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState<{ version: string; body: string } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);

  const checkForUpdate = useCallback(async () => {
    setChecking(true);
    setUpdateStatus(null);
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (update) {
        setUpdateAvailable({ version: update.version, body: update.body ?? "" });
        setUpdateStatus(`v${update.version} available`);
      } else {
        setUpdateStatus("Up to date");
        setUpdateAvailable(null);
      }
    } catch (e) {
      setUpdateStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setChecking(false);
    }
  }, []);

  const installUpdate = useCallback(async () => {
    setDownloading(true);
    setProgress(0);
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const { relaunch } = await import("@tauri-apps/plugin-process");
      const update = await check();
      if (!update) return;
      let totalSize = 0;
      let downloaded = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started" && event.data.contentLength) {
          totalSize = event.data.contentLength;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          if (totalSize > 0) setProgress(Math.round((downloaded / totalSize) * 100));
        }
      });
      await relaunch();
    } catch (e) {
      setUpdateStatus(`Install failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDownloading(false);
    }
  }, []);

  useEffect(() => { checkForUpdate(); }, [checkForUpdate]);

  return (
    <div className="p-3 space-y-3">
      {/* Update */}
      <Card className="border-border/50 bg-card/50">
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
            Updates
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-1 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Current</span>
            <Badge variant="outline" className="text-[9px] h-4 font-mono">v{__APP_VERSION__}</Badge>
          </div>
          <Separator className="opacity-30" />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Status</span>
            <span className="text-[10px] text-muted-foreground font-mono">
              {checking ? "Checking..." : updateStatus ?? "—"}
            </span>
          </div>
          {updateAvailable && !downloading && (
            <>
              <Separator className="opacity-30" />
              <Button
                size="sm"
                className="w-full h-7 text-[11px]"
                onClick={installUpdate}
              >
                Update to v{updateAvailable.version}
              </Button>
              {updateAvailable.body && (
                <p className="text-[10px] text-muted-foreground leading-relaxed mt-1">{updateAvailable.body}</p>
              )}
            </>
          )}
          {downloading && (
            <>
              <Separator className="opacity-30" />
              <div className="space-y-1">
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="text-[9px] text-muted-foreground font-mono">Downloading... {progress}%</span>
              </div>
            </>
          )}
          {!updateAvailable && !checking && (
            <>
              <Separator className="opacity-30" />
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-7 text-[11px] text-muted-foreground"
                onClick={checkForUpdate}
                disabled={checking}
              >
                Check for updates
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Ollama */}
      <OllamaStatus />

      {/* About */}
      <Card className="border-border/50 bg-card/50">
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
            About
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-1 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">App</span>
            <span className="text-xs font-medium">REX</span>
          </div>
          <Separator className="opacity-30" />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">By</span>
            <span className="text-xs text-muted-foreground">D-Studio</span>
          </div>
          <Separator className="opacity-30" />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Engine</span>
            <span className="text-xs text-muted-foreground font-mono">Tauri v2 + whisper.cpp</span>
          </div>
          <Separator className="opacity-30" />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Shortcuts</span>
            <div className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded bg-muted text-[9px] font-mono">⌥</kbd>
              <span className="text-[9px] text-muted-foreground">+</span>
              <kbd className="px-1 py-0.5 rounded bg-muted text-[9px] font-mono">Space</kbd>
              <span className="text-[10px] text-muted-foreground ml-1">Voice</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function VoiceOverlay() {
  return (
    <div className="dark w-[200px] h-[48px] flex items-center justify-center bg-transparent">
      <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-black/80 backdrop-blur-xl border border-white/10 shadow-2xl">
        <div className="relative">
          <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
          <div className="absolute inset-0 w-3 h-3 rounded-full bg-red-500 animate-ping opacity-40" />
        </div>
        <span className="text-[11px] font-medium text-white/90">Listening...</span>
        <kbd className="text-[9px] text-white/40 font-mono ml-1">⌥Space</kbd>
      </div>
    </div>
  );
}

function App() {
  // If opened as voice overlay, render minimal overlay
  if (window.location.hash === "#voice-overlay") {
    return <VoiceOverlay />;
  }

  const [report, setReport] = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [lastTranscript, setLastTranscript] = useState("");
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus | null>(null);
  const [audioStatus, setAudioStatus] = useState<AudioLoggerStatus | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);

  const runChecks = useCallback(async () => {
    setLoading(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<string>("run_checks");
      setReport(JSON.parse(result));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setReport({
        groups: [
          { name: "Health Check", icon: "⚠", results: [
            { name: "Node.js check", status: "fail", message: msg },
          ]},
        ],
        status: "broken",
        timestamp: new Date().toISOString(),
        version: "0.1.0",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshStatuses = useCallback(async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const [vs, as_] = await Promise.all([
        invoke<VoiceStatus>("voice_status"),
        invoke<AudioLoggerStatus>("audio_logger_status"),
      ]);
      setVoiceStatus(vs);
      setAudioStatus(as_);
    } catch {
      setVoiceStatus({ recording: false, tiny_model: true, large_model: false, models_dir: "" });
      setAudioStatus({ capturing: false, recordings_dir: "", recordings_count: 0 });
    }
  }, []);

  const toggleAudioLogger = useCallback(async () => {
    setAudioError(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      if (audioStatus?.capturing) {
        await invoke("audio_logger_stop");
      } else {
        await invoke("audio_logger_start");
      }
      refreshStatuses();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setAudioError(msg);
      console.error("Audio logger toggle failed:", msg);
    }
  }, [audioStatus?.capturing, refreshStatuses]);

  useEffect(() => {
    runChecks();
    refreshStatuses();

    const setupListeners = async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const unlisten1 = await listen<boolean>("voice-recording", (event) => {
          setIsRecording(event.payload);
        });
        const unlisten2 = await listen<string>("voice-result", (event) => {
          setIsRecording(false);
          setLastTranscript(event.payload);
          navigator.clipboard.writeText(event.payload).catch(() => {});
        });
        const unlisten3 = await listen<string>("voice-error", (event) => {
          setIsRecording(false);
          setLastTranscript(`Error: ${event.payload}`);
        });
        return () => { unlisten1(); unlisten2(); unlisten3(); };
      } catch { /* dev mode */ }
    };
    setupListeners();

    const interval = setInterval(() => { runChecks(); refreshStatuses(); }, 60_000);
    return () => clearInterval(interval);
  }, [runChecks, refreshStatuses]);

  return (
    <div className="dark w-full h-screen flex flex-col bg-background overflow-hidden select-none text-foreground">
      {/* Header */}
      <div className="px-3.5 py-2.5 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            report?.status === "healthy" ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.4)]" :
            report?.status === "degraded" ? "bg-amber-400" : "bg-red-400"
          }`} />
          <span className="text-sm font-semibold tracking-tight">REX</span>
        </div>
        <Badge variant="outline" className="text-[9px] h-4 text-muted-foreground font-mono">
          v{__APP_VERSION__}
        </Badge>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="health" className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="w-full rounded-none border-b border-border bg-transparent h-8 px-1">
          <TabsTrigger value="health" className="text-[11px] h-6 data-[state=active]:bg-accent/50 rounded-md flex-1">
            Health
          </TabsTrigger>
          <TabsTrigger value="voice" className="text-[11px] h-6 data-[state=active]:bg-accent/50 rounded-md flex-1">
            <span className="flex items-center gap-1.5">
              Voice
              {isRecording && <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />}
            </span>
          </TabsTrigger>
          <TabsTrigger value="audio" className="text-[11px] h-6 data-[state=active]:bg-accent/50 rounded-md flex-1">
            <span className="flex items-center gap-1.5">
              Audio
              {audioStatus?.capturing && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />}
            </span>
          </TabsTrigger>
          <TabsTrigger value="memory" className="text-[11px] h-6 data-[state=active]:bg-accent/50 rounded-md flex-1">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </TabsTrigger>
          <TabsTrigger value="optimize" className="text-[11px] h-6 data-[state=active]:bg-accent/50 rounded-md flex-1">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
          </TabsTrigger>
          <TabsTrigger value="settings" className="text-[11px] h-6 data-[state=active]:bg-accent/50 rounded-md flex-1">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="health" className="flex-1 overflow-hidden mt-0">
          <HealthTab report={report} loading={loading} onRefresh={runChecks} />
        </TabsContent>
        <TabsContent value="voice" className="flex-1 overflow-auto mt-0">
          <VoiceTab isRecording={isRecording} lastTranscript={lastTranscript} voiceStatus={voiceStatus} />
        </TabsContent>
        <TabsContent value="audio" className="flex-1 overflow-auto mt-0">
          <AudioTab audioStatus={audioStatus} onToggle={toggleAudioLogger} error={audioError} />
        </TabsContent>
        <TabsContent value="memory" className="flex-1 overflow-hidden mt-0">
          <MemoryTab />
        </TabsContent>
        <TabsContent value="optimize" className="flex-1 overflow-auto mt-0">
          <OptimizeTab />
        </TabsContent>
        <TabsContent value="settings" className="flex-1 overflow-auto mt-0">
          <SettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default App;
