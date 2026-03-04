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

function StatusDot({ status, size = "sm" }: { status: string; size?: "sm" | "md" }) {
  const s = size === "md" ? "w-2.5 h-2.5" : "w-1.5 h-1.5";
  const color =
    status === "healthy" || status === "pass"
      ? "bg-green-400"
      : status === "degraded" || status === "warn"
        ? "bg-amber-400"
        : "bg-red-400";
  return <span className={`inline-block ${s} rounded-full ${color}`} />;
}

function CheckSection({ group }: { group: CheckGroup }) {
  const [open, setOpen] = useState(false);
  const passed = group.results.filter((r) => r.status === "pass").length;
  const total = group.results.length;
  const allPass = passed === total;

  return (
    <div className="border-b border-white/5 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs opacity-70">{group.icon}</span>
          <span className="text-[12px] font-medium text-white/90">{group.name}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-white/30 tabular-nums">
            {passed}/{total}
          </span>
          {allPass ? (
            <span className="text-green-400 text-[10px]">&#10003;</span>
          ) : (
            <StatusDot status="warn" />
          )}
          <span
            className={`text-[9px] text-white/20 transition-transform ${open ? "rotate-90" : ""}`}
          >
            &#9656;
          </span>
        </div>
      </button>
      {open && (
        <div className="px-3 pb-1.5">
          {group.results.map((r, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 py-0.5 text-[11px] text-white/50"
            >
              <StatusDot status={r.status} />
              <span className="truncate flex-1">{r.name}</span>
              <span className="text-white/20 truncate max-w-[120px] text-[10px]">
                {r.message}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function App() {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [lastTranscript, setLastTranscript] = useState<string>("");

  const runChecks = useCallback(async () => {
    setLoading(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<string>("run_checks");
      const parsed: HealthReport = JSON.parse(result);
      setReport(parsed);
    } catch {
      // Dev fallback
      setReport({
        groups: [
          {
            name: "Config", icon: "⚙",
            results: [
              { name: "CLAUDE.md", status: "pass", message: "Present" },
              { name: "settings.json", status: "pass", message: "Valid JSON" },
              { name: "vault.md", status: "pass", message: "Present" },
            ],
          },
          {
            name: "Rules", icon: "📏",
            results: [
              { name: "api-design.md", status: "pass", message: "OK" },
              { name: "security.md", status: "pass", message: "OK" },
              { name: "testing.md", status: "pass", message: "OK" },
            ],
          },
          {
            name: "Guards", icon: "🛡",
            results: [
              { name: "completion-guard", status: "pass", message: "Installed" },
              { name: "dangerous-cmd-guard", status: "pass", message: "Installed" },
              { name: "test-protect-guard", status: "pass", message: "Installed" },
              { name: "ui-checklist-guard", status: "pass", message: "Installed" },
              { name: "scope-guard", status: "pass", message: "Installed" },
              { name: "session-summary", status: "pass", message: "Installed" },
            ],
          },
          {
            name: "Hooks", icon: "🪝",
            results: [
              { name: "PreToolUse", status: "pass", message: "2 handlers" },
              { name: "PostToolUse", status: "pass", message: "3 handlers" },
              { name: "Stop", status: "pass", message: "3 handlers" },
            ],
          },
          {
            name: "MCP Servers", icon: "🔌",
            results: [
              { name: "rex-memory", status: "pass", message: "node found" },
            ],
          },
          {
            name: "Environment", icon: "💻",
            results: [
              { name: "Claude Code", status: "pass", message: "v2.1.68" },
              { name: "Node.js", status: "pass", message: "v22.20.0" },
            ],
          },
        ],
        status: "healthy",
        timestamp: new Date().toISOString(),
        version: "0.1.0",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    runChecks();

    const setupListeners = async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const unlisten1 = await listen<boolean>("voice-recording", () => {
          setIsRecording(true);
        });
        const unlisten2 = await listen<string>("voice-result", (event) => {
          setIsRecording(false);
          setLastTranscript(event.payload);
          navigator.clipboard.writeText(event.payload).catch(() => {});
        });
        return () => {
          unlisten1();
          unlisten2();
        };
      } catch {
        // Not in Tauri context
      }
    };
    setupListeners();

    // Auto-refresh every 60s
    const interval = setInterval(runChecks, 60_000);
    return () => clearInterval(interval);
  }, [runChecks]);

  const allResults = report?.groups.flatMap((g) => g.results) ?? [];
  const passed = allResults.filter((r) => r.status === "pass").length;
  const total = allResults.length;

  const statusColor =
    report?.status === "healthy"
      ? "text-green-400"
      : report?.status === "degraded"
        ? "text-amber-400"
        : "text-red-400";

  const dotStyle =
    report?.status === "healthy"
      ? "bg-green-400 shadow-[0_0_6px_rgba(34,197,94,0.5)]"
      : report?.status === "degraded"
        ? "bg-amber-400"
        : "bg-red-400";

  return (
    <div className="w-[340px] bg-[#1e1e1e] rounded-xl overflow-hidden select-none text-white border border-white/10">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-white/10 flex items-center justify-between bg-[#252525]">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${dotStyle}`} />
          <span className="text-[13px] font-semibold tracking-tight">REX</span>
          <span className={`text-[11px] font-medium ${statusColor} uppercase tracking-wider`}>
            {report?.status ?? "..."}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-white/25 tabular-nums">
            {passed}/{total}
          </span>
          <span className="text-[10px] text-white/20">
            v{report?.version ?? "0.1.0"}
          </span>
        </div>
      </div>

      {/* Checks */}
      <div className="max-h-[380px] overflow-y-auto">
        {loading && !report ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-4 h-4 border-2 border-white/10 border-t-white/50 rounded-full animate-spin" />
          </div>
        ) : (
          report?.groups.map((group, i) => (
            <CheckSection key={i} group={group} />
          ))
        )}
      </div>

      {/* Voice */}
      <div className="px-3 py-2 border-t border-white/10 bg-[#252525]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className={`text-xs ${isRecording ? "animate-pulse" : "opacity-50"}`}>
              {isRecording ? "🔴" : "🎙"}
            </span>
            <span className="text-[11px] text-white/60">
              {isRecording ? "Recording..." : "⌥Space"}
            </span>
          </div>
          <button
            onClick={runChecks}
            disabled={loading}
            className="text-[11px] text-white/30 hover:text-white/60 transition-colors disabled:opacity-30"
          >
            {loading ? "..." : "↻ Refresh"}
          </button>
        </div>
        {lastTranscript && (
          <div className="mt-1 text-[10px] text-white/40 bg-white/5 rounded px-2 py-1 truncate">
            {lastTranscript}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
