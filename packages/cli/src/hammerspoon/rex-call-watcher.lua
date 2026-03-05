-- REX Call Watcher
-- Detects known voice apps (Discord/Zoom/Meet/Slack/Teams/WhatsApp/FaceTime)
-- and writes a machine-readable state for local automations.

local M = {}

local HOME = os.getenv("HOME") or ""
local STATE_PATH = HOME .. "/.rex-memory/runtime/call-state.json"
local EVENTS_PATH = HOME .. "/.rex-memory/runtime/call-events.jsonl"

local VOICE_APPS = {
  ["Discord"] = true,
  ["zoom.us"] = true,
  ["Microsoft Teams"] = true,
  ["Slack"] = true,
  ["WhatsApp"] = true,
  ["FaceTime"] = true,
  ["Telegram"] = true,
}

local BROWSER_APPS = {
  ["Google Chrome"] = true,
  ["Arc"] = true,
  ["Brave Browser"] = true,
  ["Safari"] = true,
  ["Microsoft Edge"] = true,
}

local BROWSER_KEYWORDS = {
  "google meet",
  " meet",
  " huddle",
  "slack call",
  "discord",
  "voice",
  "call",
}

local watcher = nil
local heartbeat = nil

local current = {
  active = false,
  app = "",
  reason = "",
  title = "",
  startedAt = 0,
  updatedAt = 0,
}

local function ensureRuntimeDir()
  os.execute('mkdir -p "' .. HOME .. '/.rex-memory/runtime"')
end

local function writeState(state)
  ensureRuntimeDir()
  local f = io.open(STATE_PATH, "w")
  if not f then return end
  f:write(hs.json.encode(state))
  f:close()
end

local function appendEvent(ev)
  ensureRuntimeDir()
  local f = io.open(EVENTS_PATH, "a")
  if not f then return end
  f:write(hs.json.encode(ev) .. "\n")
  f:close()
end

local function titleLooksLikeCall(title)
  if not title then return false end
  local t = string.lower(title)
  for _, kw in ipairs(BROWSER_KEYWORDS) do
    if string.find(t, kw, 1, true) then
      return true
    end
  end
  return false
end

local function detectCall(appName)
  if VOICE_APPS[appName] then
    return true, "voice_app"
  end

  if BROWSER_APPS[appName] then
    local win = hs.window.frontmostWindow()
    local title = win and win:title() or ""
    if titleLooksLikeCall(title) then
      return true, "browser_title", title
    end
  end

  return false, "", ""
end

local function updateFromFrontmost()
  local app = hs.application.frontmostApplication()
  local appName = app and app:name() or ""
  local now = os.time()
  local active, reason, title = detectCall(appName)

  if active and not current.active then
    current.active = true
    current.app = appName
    current.reason = reason
    current.title = title or ""
    current.startedAt = now
    current.updatedAt = now

    appendEvent({
      type = "call_start",
      app = current.app,
      reason = current.reason,
      title = current.title,
      timestamp = now,
      iso = os.date("!%Y-%m-%dT%H:%M:%SZ", now),
    })
  elseif active and current.active then
    current.updatedAt = now
    if current.app ~= appName then
      current.app = appName
      current.reason = reason
      current.title = title or ""
    end
  elseif (not active) and current.active then
    local duration = math.max(0, now - (current.startedAt or now))
    appendEvent({
      type = "call_end",
      app = current.app,
      reason = current.reason,
      title = current.title,
      duration = duration,
      startedAt = current.startedAt,
      endedAt = now,
      iso = os.date("!%Y-%m-%dT%H:%M:%SZ", now),
    })

    current.active = false
    current.app = ""
    current.reason = ""
    current.title = ""
    current.startedAt = 0
    current.updatedAt = now
  end

  writeState({
    active = current.active,
    app = current.app,
    reason = current.reason,
    title = current.title,
    startedAt = current.startedAt,
    updatedAt = current.updatedAt,
    iso = os.date("!%Y-%m-%dT%H:%M:%SZ", now),
  })
end

function M.start()
  if watcher then return end

  watcher = hs.application.watcher.new(function(_, eventType, _)
    if eventType == hs.application.watcher.activated then
      updateFromFrontmost()
    end
  end)
  watcher:start()

  -- Keep state fresh even if app title changes without app switch (browser tabs).
  heartbeat = hs.timer.doEvery(5, updateFromFrontmost)
  updateFromFrontmost()
  hs.printf("REX Call Watcher started")
end

function M.stop()
  if watcher then
    watcher:stop()
    watcher = nil
  end
  if heartbeat then
    heartbeat:stop()
    heartbeat = nil
  end
end

return M
