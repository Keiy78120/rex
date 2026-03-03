-- REX Activity Logger for Hammerspoon
-- Logs active app switches with timestamps and durations

local M = {}

local logFile = os.getenv("HOME") .. "/Documents/Developer/_config/rex/activity/activity.jsonl"
local currentApp = nil
local switchTime = nil

local function writeLog(entry)
  local f = io.open(logFile, "a")
  if f then
    f:write(hs.json.encode(entry) .. "\n")
    f:close()
  end
end

local function onAppSwitch(appName, eventType)
  if eventType == hs.application.watcher.activated then
    local now = os.time()

    if currentApp and switchTime then
      writeLog({
        app = currentApp,
        started = switchTime,
        ended = now,
        duration = now - switchTime,
        date = os.date("%Y-%m-%d %H:%M:%S", now),
      })
    end

    currentApp = appName
    switchTime = now
  end
end

function M.start()
  M.watcher = hs.application.watcher.new(onAppSwitch)
  M.watcher:start()
  hs.printf("REX Activity Logger started")
end

function M.stop()
  if M.watcher then
    M.watcher:stop()
  end
end

return M
