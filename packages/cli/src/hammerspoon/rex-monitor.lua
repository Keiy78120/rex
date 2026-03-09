-- rex-monitor.lua
-- REX Monitor — track app switches, clipboard activity, and hotkeys.
-- Writes structured events to ~/.claude/rex/monitor/events.jsonl
-- Install: copy to ~/.hammerspoon/ and add `require("rex-monitor")` to init.lua

local REX_MONITOR_DIR = os.getenv("HOME") .. "/.claude/rex/monitor"
local EVENTS_FILE = REX_MONITOR_DIR .. "/events.jsonl"
local MAX_FILE_LINES = 10000

-- Ensure monitor directory exists
os.execute("mkdir -p " .. REX_MONITOR_DIR)

-- Simple JSON serializer (no external deps)
local function toJsonString(s)
  s = tostring(s)
  s = s:gsub('\\', '\\\\')
  s = s:gsub('"', '\\"')
  s = s:gsub('\n', '\\n')
  s = s:gsub('\r', '\\r')
  s = s:gsub('\t', '\\t')
  return s
end

local function writeEvent(eventType, dataTable)
  local ts = os.date("!%Y-%m-%dT%H:%M:%SZ")
  local parts = {}
  for k, v in pairs(dataTable) do
    table.insert(parts, '"' .. toJsonString(k) .. '":"' .. toJsonString(v) .. '"')
  end
  local dataJson = '{' .. table.concat(parts, ',') .. '}'
  local line = '{"ts":"' .. ts .. '","type":"' .. eventType .. '","data":' .. dataJson .. '}'

  local f = io.open(EVENTS_FILE, "a")
  if f then
    f:write(line .. "\n")
    f:close()
  end
end

-- ─── App Focus Watcher ────────────────────────────────────────────────────────

local appWatcher = hs.application.watcher.new(function(name, eventType, app)
  if eventType == hs.application.watcher.activated then
    local appName = name or "unknown"
    -- Skip system processes
    if appName ~= "Dock" and appName ~= "SystemUIServer" and appName ~= "Notification Center" then
      writeEvent("app_focus", { app = appName })
    end
  end
end)
appWatcher:start()

-- ─── Clipboard Watcher ────────────────────────────────────────────────────────

local lastClipboard = ""
local clipboardTimer = hs.timer.doEvery(5, function()
  local current = hs.pasteboard.getContents() or ""
  if current ~= lastClipboard and #current > 0 and #current < 500 then
    -- Skip secrets (simple heuristic)
    local isSecret = current:match("sk%-") or
                     current:match("ghp_") or
                     current:match("xox") or
                     current:match("Bearer ") or
                     current:match("password") or
                     current:match("secret") or
                     current:match("[A-Fa-f0-9]{32,}")
    if not isSecret then
      writeEvent("clipboard", { len = tostring(#current), prefix = current:sub(1, 20) })
    end
    lastClipboard = current
  end
end)

-- ─── Hotkey Logger ────────────────────────────────────────────────────────────
-- Log when productivity hotkeys are used (not keystrokes, just meta keys)

local function logHotkey(name)
  writeEvent("hotkey", { name = name })
end

-- Common productivity hotkeys (app-agnostic)
hs.hotkey.bind({"cmd", "shift"}, "s", function() logHotkey("save_all") end)
hs.hotkey.bind({"cmd"}, "t", function() logHotkey("new_tab") end)
hs.hotkey.bind({"cmd", "shift"}, "f", function() logHotkey("find_in_files") end)

-- ─── Heartbeat ────────────────────────────────────────────────────────────────

local heartbeatTimer = hs.timer.doEvery(1800, function()
  writeEvent("heartbeat", { uptime = tostring(hs.timer.secondsSinceEpoch()) })
end)

-- ─── Log rotation (trim to MAX_FILE_LINES) ───────────────────────────────────

hs.timer.doEvery(86400, function()
  local f = io.open(EVENTS_FILE, "r")
  if not f then return end
  local lines = {}
  for line in f:lines() do
    table.insert(lines, line)
  end
  f:close()

  if #lines > MAX_FILE_LINES then
    local trimmed = {}
    for i = #lines - MAX_FILE_LINES + 1, #lines do
      table.insert(trimmed, lines[i])
    end
    local fw = io.open(EVENTS_FILE, "w")
    if fw then
      fw:write(table.concat(trimmed, "\n") .. "\n")
      fw:close()
    end
  end
end)

-- ─── Startup ──────────────────────────────────────────────────────────────────

writeEvent("startup", { version = "1.0" })
print("[REX Monitor] Loaded — writing events to " .. EVENTS_FILE)
