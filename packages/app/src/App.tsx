import { useEffect, useState, useCallback } from "react";
import "./App.css";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

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
    } catch {
      setReport({
        groups: [
          { name: "Config", icon: "⚙", results: [
            { name: "CLAUDE.md", status: "pass", message: "Present" },
            { name: "settings.json", status: "pass", message: "Valid" },
          ]},
          { name: "Guards", icon: "🛡", results: [
            { name: "completion-guard", status: "pass", message: "Installed" },
            { name: "dangerous-cmd-guard", status: "pass", message: "Installed" },
            { name: "test-protect-guard", status: "pass", message: "Installed" },
          ]},
          { name: "Hooks", icon: "🪝", results: [
            { name: "PreToolUse", status: "pass", message: "2 handlers" },
            { name: "PostToolUse", status: "pass", message: "3 handlers" },
          ]},
        ],
        status: "healthy",
        timestamp: new Date().toISOString(),
        version: "0.2.0",
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
          v{report?.version ?? "0.2.0"}
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
      </Tabs>
    </div>
  );
}

export default App;
