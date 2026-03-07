# REX sur Linux / VPS

REX CLI + Memory fonctionnent sur Linux. Flutter app et LaunchAgents sont macOS uniquement.

## Installation Linux

```bash
npm install -g rex-claude
rex init --no-launchagents
```

> `install.sh` détecte automatiquement Linux et skipe Hammerspoon + LaunchAgents.

## Gateway (systemd)

Créer `/etc/systemd/system/rex-gateway.service` :

```ini
[Unit]
Description=REX Gateway
After=network.target

[Service]
Type=simple
User=$USER
ExecStart=/usr/local/bin/rex gateway
Restart=always
Environment=OLLAMA_URL=http://localhost:11434

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable rex-gateway
sudo systemctl start rex-gateway
sudo systemctl status rex-gateway
```

## Daemon (systemd)

Pour le daemon complet (ingest + watchdog) :

```ini
[Unit]
Description=REX Daemon
After=network.target

[Service]
Type=simple
User=$USER
ExecStart=/usr/local/bin/rex daemon
Restart=always
Environment=OLLAMA_URL=http://localhost:11434

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable rex-daemon
sudo systemctl start rex-daemon
```

## Ollama sur VPS

```bash
curl -fsSL https://ollama.ai/install.sh | sh
ollama pull nomic-embed-text
ollama pull qwen2.5:1.5b
```

Pour un Ollama distant, définir la variable d'environnement :

```bash
export OLLAMA_URL=http://<ip>:11434
```

## Limitations Linux

| Fonctionnalité | Linux | macOS |
|---|---|---|
| CLI (`rex`, `rex gateway`) | ✅ | ✅ |
| Memory (SQLite + embeddings) | ✅ | ✅ |
| Telegram Gateway | ✅ | ✅ |
| Flutter App | ❌ | ✅ |
| Hammerspoon (activity logger) | ❌ | ✅ |
| LaunchAgents | ❌ | ✅ |
| systemd services | ✅ | ❌ |
