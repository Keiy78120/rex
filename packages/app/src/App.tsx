import { useEffect, useState, useCallback } from "react";
import "./App.css";

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

type Tab = "health" | "voice" | "audio";

function StatusDot({ status }: { status: string }) {
  const color =
    status === "healthy" || status === "pass"
      ? "bg-emerald-400"
      : status === "degraded" || status === "warn"
        ? "bg-amber-400"
        : "bg-red-400";
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${color}`} />;
}

function CheckSection({ group }: { group: CheckGroup }) {
  const [open, setOpen] = useState(false);
  const passed = group.results.filter((r) => r.status === "pass").length;
  const total = group.results.length;
  const allPass = passed === total;

  return (
    <div className="border-b border-white/[0.04] last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3.5 py-2 hover:bg-white/[0.03] transition-colors text-left group"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-[11px] grayscale opacity-50 group-hover:opacity-70 transition-opacity">{group.icon}</span>
          <span className="text-[12px] font-medium text-white/80">{group.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-white/20 tabular-nums font-mono">
            {passed}/{total}
          </span>
          {allPass ? (
            <span className="text-emerald-400/70 text-[10px]">✓</span>
          ) : (
            <StatusDot status="warn" />
          )}
          <svg
            className={`w-2.5 h-2.5 text-white/15 transition-transform duration-150 ${open ? "rotate-90" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </button>
      {open && (
        <div className="px-3.5 pb-2 space-y-0.5">
          {group.results.map((r, i) => (
            <div
              key={i}
              className="flex items-center gap-2 py-[3px] text-[11px]"
            >
              <StatusDot status={r.status} />
              <span className="text-white/50 truncate flex-1">{r.name}</span>
              <span className="text-white/15 truncate max-w-[100px] text-[10px] font-mono">
                {r.message}
              </span>
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
      {/* Summary bar */}
      <div className="px-3.5 py-2 flex items-center justify-between border-b border-white/[0.04]">
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-medium ${
            report?.status === "healthy" ? "text-emerald-400" :
            report?.status === "degraded" ? "text-amber-400" : "text-red-400"
          }`}>
            {report?.status?.toUpperCase() ?? "..."}
          </span>
          <span className="text-[10px] text-white/15 font-mono">{passed}/{total}</span>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="text-white/20 hover:text-white/50 transition-colors disabled:opacity-30"
        >
          <svg className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Checks list */}
      <div className="flex-1 overflow-y-auto">
        {loading && !report ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-4 h-4 border-2 border-white/5 border-t-white/30 rounded-full animate-spin" />
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
    <div className="p-3.5 space-y-3">
      {/* Recording indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
            isRecording
              ? "bg-red-500/20 ring-2 ring-red-500/30 animate-pulse"
              : "bg-white/[0.04]"
          }`}>
            <svg className={`w-4 h-4 ${isRecording ? "text-red-400" : "text-white/30"}`} fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
            </svg>
          </div>
          <div>
            <div className="text-[12px] font-medium text-white/80">
              {isRecording ? "Recording..." : "Voice Ready"}
            </div>
            <div className="text-[10px] text-white/25 font-mono">⌥ Space</div>
          </div>
        </div>
      </div>

      {/* Last transcript */}
      {lastTranscript && (
        <div className="bg-white/[0.03] rounded-lg px-3 py-2.5 border border-white/[0.04]">
          <div className="text-[10px] text-white/20 mb-1">Last transcript</div>
          <div className="text-[11px] text-white/60 leading-relaxed">{lastTranscript}</div>
        </div>
      )}

      {/* Models status */}
      <div className="space-y-1">
        <div className="text-[10px] text-white/20 uppercase tracking-wider font-medium px-0.5">Models</div>
        <div className="bg-white/[0.02] rounded-lg border border-white/[0.04] divide-y divide-white/[0.04]">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[11px] text-white/50">Tiny (fast)</span>
            <span className={`text-[10px] font-mono ${voiceStatus?.tiny_model ? "text-emerald-400/70" : "text-red-400/70"}`}>
              {voiceStatus?.tiny_model ? "ready" : "missing"}
            </span>
          </div>
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[11px] text-white/50">Large (accurate)</span>
            <span className={`text-[10px] font-mono ${voiceStatus?.large_model ? "text-emerald-400/70" : "text-white/20"}`}>
              {voiceStatus?.large_model ? "ready" : "optional"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function AudioTab({ audioStatus, onStart, onStop }: {
  audioStatus: AudioLoggerStatus | null;
  onStart: () => void;
  onStop: () => void;
}) {
  return (
    <div className="p-3.5 space-y-3">
      {/* Capture control */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
            audioStatus?.capturing
              ? "bg-cyan-500/20 ring-2 ring-cyan-500/30"
              : "bg-white/[0.04]"
          }`}>
            <svg className={`w-4 h-4 ${audioStatus?.capturing ? "text-cyan-400" : "text-white/30"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
            </svg>
          </div>
          <div>
            <div className="text-[12px] font-medium text-white/80">
              {audioStatus?.capturing ? "Capturing Audio" : "Audio Logger"}
            </div>
            <div className="text-[10px] text-white/25">System audio • Meetings & calls</div>
          </div>
        </div>
      </div>

      {/* Toggle button */}
      <button
        onClick={audioStatus?.capturing ? onStop : onStart}
        className={`w-full py-2 rounded-lg text-[11px] font-medium transition-all ${
          audioStatus?.capturing
            ? "bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20"
            : "bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 border border-cyan-500/20"
        }`}
      >
        {audioStatus?.capturing ? "Stop Capture" : "Start Capture"}
      </button>

      {/* Stats */}
      <div className="bg-white/[0.02] rounded-lg border border-white/[0.04] divide-y divide-white/[0.04]">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-[11px] text-white/50">Recordings</span>
          <span className="text-[10px] font-mono text-white/30">{audioStatus?.recordings_count ?? 0}</span>
        </div>
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-[11px] text-white/50">Status</span>
          <span className={`text-[10px] font-mono ${audioStatus?.capturing ? "text-cyan-400/70" : "text-white/20"}`}>
            {audioStatus?.capturing ? "recording" : "idle"}
          </span>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [lastTranscript, setLastTranscript] = useState("");
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus | null>(null);
  const [audioStatus, setAudioStatus] = useState<AudioLoggerStatus | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("health");

  const runChecks = useCallback(async () => {
    setLoading(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<string>("run_checks");
      setReport(JSON.parse(result));
    } catch {
      // Dev fallback
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
        invoke<{ recording: boolean; tiny_model: boolean; large_model: boolean; models_dir: string }>("voice_status"),
        invoke<{ capturing: boolean; recordings_dir: string; recordings_count: number }>("audio_logger_status"),
      ]);
      setVoiceStatus(vs);
      setAudioStatus(as_);
    } catch {
      setVoiceStatus({ recording: false, tiny_model: true, large_model: false, models_dir: "" });
      setAudioStatus({ capturing: false, recordings_dir: "", recordings_count: 0 });
    }
  }, []);

  const startAudioLogger = useCallback(async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("audio_logger_start");
      refreshStatuses();
    } catch (e) {
      console.error("Failed to start audio logger:", e);
    }
  }, [refreshStatuses]);

  const stopAudioLogger = useCallback(async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("audio_logger_stop");
      refreshStatuses();
    } catch (e) {
      console.error("Failed to stop audio logger:", e);
    }
  }, [refreshStatuses]);

  useEffect(() => {
    runChecks();
    refreshStatuses();

    const setupListeners = async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const unlisten1 = await listen<boolean>("voice-recording", () => setIsRecording(true));
        const unlisten2 = await listen<string>("voice-result", (event) => {
          setIsRecording(false);
          setLastTranscript(event.payload);
          navigator.clipboard.writeText(event.payload).catch(() => {});
        });
        return () => { unlisten1(); unlisten2(); };
      } catch {}
    };
    setupListeners();

    const interval = setInterval(() => { runChecks(); refreshStatuses(); }, 60_000);
    return () => clearInterval(interval);
  }, [runChecks, refreshStatuses]);

  const statusColor = report?.status === "healthy" ? "bg-emerald-400" :
    report?.status === "degraded" ? "bg-amber-400" : "bg-red-400";

  const tabs: { id: Tab; label: string; indicator?: boolean }[] = [
    { id: "health", label: "Health" },
    { id: "voice", label: "Voice", indicator: isRecording },
    { id: "audio", label: "Audio", indicator: audioStatus?.capturing },
  ];

  return (
    <div className="w-[320px] h-[420px] flex flex-col bg-[#0c0c0c] rounded-xl overflow-hidden select-none text-white border border-white/[0.06]">
      {/* Header */}
      <div className="px-3.5 py-2.5 flex items-center justify-between bg-[#0c0c0c] border-b border-white/[0.04]">
        <div className="flex items-center gap-2">
          <div className={`w-[7px] h-[7px] rounded-full ${statusColor} shadow-[0_0_6px_rgba(52,211,153,0.3)]`} />
          <span className="text-[13px] font-semibold tracking-tight">REX</span>
        </div>
        <span className="text-[10px] text-white/15 font-mono">v{report?.version ?? "0.2.0"}</span>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-white/[0.04] bg-[#0c0c0c]">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 text-[11px] font-medium transition-colors relative ${
              activeTab === tab.id
                ? "text-white/80"
                : "text-white/25 hover:text-white/40"
            }`}
          >
            <span className="flex items-center justify-center gap-1.5">
              {tab.label}
              {tab.indicator && (
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              )}
            </span>
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-3 right-3 h-[1px] bg-white/20 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "health" && (
          <HealthTab report={report} loading={loading} onRefresh={runChecks} />
        )}
        {activeTab === "voice" && (
          <VoiceTab isRecording={isRecording} lastTranscript={lastTranscript} voiceStatus={voiceStatus} />
        )}
        {activeTab === "audio" && (
          <AudioTab audioStatus={audioStatus} onStart={startAudioLogger} onStop={stopAudioLogger} />
        )}
      </div>
    </div>
  );
}

export default App;
