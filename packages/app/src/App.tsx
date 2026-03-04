import { useEffect, useState } from "react";
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

function StatusDot({ status }: { status: string }) {
  const color =
    status === "healthy" || status === "pass"
      ? "bg-green-500"
      : status === "degraded" || status === "warn"
        ? "bg-yellow-500"
        : "bg-gray-400";
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />;
}

function CheckSection({ group }: { group: CheckGroup }) {
  const [open, setOpen] = useState(false);
  const passed = group.results.filter((r) => r.status === "pass").length;
  const total = group.results.length;
  const allPass = passed === total;

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-sm">{group.icon}</span>
          <span className="text-[13px] font-medium text-gray-900">
            {group.name}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-gray-400">
            {passed}/{total}
          </span>
          {allPass ? (
            <span className="text-green-500 text-[12px]">&#10003;</span>
          ) : (
            <StatusDot status="warn" />
          )}
          <span
            className={`text-[10px] text-gray-400 transition-transform ${open ? "rotate-90" : ""}`}
          >
            &#9656;
          </span>
        </div>
      </button>
      {open && (
        <div className="px-4 pb-2">
          {group.results.map((r, i) => (
            <div
              key={i}
              className="flex items-center gap-2 py-1 text-[12px] text-gray-600"
            >
              <StatusDot status={r.status} />
              <span className="truncate flex-1">{r.name}</span>
              <span className="text-gray-400 truncate max-w-[140px]">
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
  const [lastCheck, setLastCheck] = useState<string>("");
  const [isRecording, setIsRecording] = useState(false);
  const [lastTranscript, setLastTranscript] = useState<string>("");

  const runChecks = async () => {
    setLoading(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<string>("run_checks");
      const parsed: HealthReport = JSON.parse(result);
      setReport(parsed);
      setLastCheck("just now");
    } catch {
      // Fallback mock for dev
      setReport({
        groups: [
          {
            name: "Config",
            icon: "\u2699\uFE0F",
            results: [
              { name: "CLAUDE.md", status: "pass", message: "Present and non-empty" },
              { name: "settings.json", status: "pass", message: "Valid JSON" },
              { name: "vault.md", status: "pass", message: "Present" },
            ],
          },
          {
            name: "MCP Servers",
            icon: "\uD83D\uDD0C",
            results: [
              { name: "rex-memory", status: "pass", message: "node found" },
            ],
          },
          {
            name: "Plugins",
            icon: "\uD83E\uDDE9",
            results: [
              { name: "superpowers", status: "pass", message: "Installed" },
            ],
          },
          {
            name: "Hooks",
            icon: "\uD83E\uDE9D",
            results: [
              { name: "UserPromptSubmit", status: "pass", message: "1 handler(s)" },
              { name: "PreToolUse", status: "pass", message: "1 handler(s)" },
              { name: "Stop", status: "pass", message: "1 handler(s)" },
            ],
          },
        ],
        status: "healthy",
        timestamp: new Date().toISOString(),
        version: "0.1.0",
      });
      setLastCheck("just now");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runChecks();

    // Listen for voice events from Rust
    const setupListeners = async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const unlisten1 = await listen<boolean>("voice-recording", () => {
          setIsRecording(true);
        });
        const unlisten2 = await listen<string>("voice-result", (event) => {
          setIsRecording(false);
          setLastTranscript(event.payload);
          // Copy to clipboard
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
  }, []);

  const statusColor =
    report?.status === "healthy"
      ? "text-green-600"
      : report?.status === "degraded"
        ? "text-yellow-600"
        : "text-red-600";

  return (
    <div className="w-[360px] bg-white rounded-xl overflow-hidden select-none">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="text-[14px] font-semibold text-gray-900">REX</span>
        </div>
        <div className="text-right">
          <span className={`text-[13px] font-medium ${statusColor} capitalize`}>
            {report?.status ?? "checking..."}
          </span>
          <div className="text-[11px] text-gray-400">
            v{report?.version ?? "0.1.0"} &middot; {lastCheck || "..."}
          </div>
        </div>
      </div>

      {/* Checks */}
      <div className="max-h-[400px] overflow-y-auto">
        {loading && !report ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
          </div>
        ) : (
          report?.groups.map((group, i) => (
            <CheckSection key={i} group={group} />
          ))
        )}
      </div>

      {/* Voice Section */}
      <div className="px-4 py-2.5 border-t border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`text-sm ${isRecording ? "animate-pulse" : ""}`}>
              {isRecording ? "🔴" : "🎙"}
            </span>
            <span className="text-[13px] font-medium text-gray-900">Voice</span>
          </div>
          <span className="text-[12px] text-gray-400">
            {isRecording ? "Recording..." : "⌥Space to talk"}
          </span>
        </div>
        {lastTranscript && (
          <div className="mt-1.5 text-[11px] text-gray-500 bg-gray-50 rounded px-2 py-1 truncate">
            {lastTranscript}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-gray-200 flex items-center justify-between">
        <button className="text-[12px] text-gray-500 hover:text-gray-700 transition-colors">
          Settings
        </button>
        <button
          onClick={runChecks}
          className="text-[12px] text-blue-600 hover:text-blue-700 font-medium transition-colors"
        >
          Run Doctor
        </button>
      </div>
    </div>
  );
}

export default App;
