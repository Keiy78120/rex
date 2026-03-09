# REX — Installation VPS (hub-vps profile)

> Guide complet pour déployer REX sur un VPS Ubuntu/Debian comme "Brain" permanent.
> REX tourne 24/7, orchestre la fleet, sert le hub, relaie Telegram.

---

## 1. Prérequis VPS

| Ressource | Minimum | Recommandé |
|-----------|---------|------------|
| CPU | 2 vCPU | 4 vCPU |
| RAM | 2 GB | 8 GB |
| Disque | 20 GB SSD | 50 GB SSD |
| OS | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |
| Providers | Hetzner (€4/mois) | Hetzner CX22 (€6/mois) |

---

## 2. Bootstrap VPS (one-shot)

```bash
# 1. Connexion SSH
ssh root@<VPS_IP>

# 2. Installer Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs git

# 3. Installer pnpm
npm install -g pnpm

# 4. Cloner REX
git clone https://github.com/Keiy78120/rex.git ~/rex
cd ~/rex

# 5. Installer les dépendances
pnpm install

# 6. Build CLI
pnpm build

# 7. Lier la commande rex globalement
npm link packages/cli

# 8. Vérifier
rex --version
```

---

## 3. Configuration VPS (hub-vps profile)

```bash
# Setup automatique (détecte l'environnement headless)
rex install --profile hub-vps --yes

# Ce que ça fait :
# ✓ Init guards + hooks Claude Code
# ✓ Config daemon (systemd)
# ✓ Hub API (port 7420)
# ✓ Gateway Telegram (si tokens configurés)
# ✓ Génère REX_HUB_TOKEN
```

### Credentials (à faire AVANT install)

Créer `~/.claude/settings.json` avec :

```json
{
  "env": {
    "REX_TELEGRAM_BOT_TOKEN": "<token_bot>",
    "REX_TELEGRAM_CHAT_ID":   "<chat_id>",
    "OLLAMA_URL":             "http://localhost:11434",
    "REX_HUB_TOKEN":          ""
  }
}
```

---

## 4. Systemd (daemon permanent)

```bash
# Créer le service
cat > /etc/systemd/system/rex-daemon.service << 'EOF'
[Unit]
Description=REX Daemon
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root
ExecStart=/usr/local/bin/rex daemon
Restart=always
RestartSec=10
Environment=HOME=/root
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# Activer et démarrer
systemctl daemon-reload
systemctl enable rex-daemon
systemctl start rex-daemon
systemctl status rex-daemon
```

### Gateway Telegram comme service séparé

```bash
cat > /etc/systemd/system/rex-gateway.service << 'EOF'
[Unit]
Description=REX Gateway (Telegram)
After=network.target rex-daemon.service

[Service]
Type=simple
User=root
WorkingDirectory=/root
ExecStart=/usr/local/bin/rex gateway
Restart=always
RestartSec=5
Environment=HOME=/root

[Install]
WantedBy=multi-user.target
EOF

systemctl enable rex-gateway
systemctl start rex-gateway
```

---

## 5. Ollama sur VPS (optionnel — si GPU disponible)

```bash
# Installer Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Modèles essentiels REX
ollama pull nomic-embed-text    # embeddings mémoire
ollama pull qwen2.5:1.5b        # categorize/classify (léger)
ollama pull qwen2.5-coder:7b    # code review (si RAM > 8GB)

# Vérifier
ollama list
```

Si pas de GPU → utiliser Ollama sur le Mac et pointer `OLLAMA_URL` vers lui via Tailscale :

```json
{
  "env": {
    "OLLAMA_URL": "http://100.x.x.x:11434"
  }
}
```

---

## 6. Tailscale (mesh sécurisé)

```bash
# Installer Tailscale
curl -fsSL https://tailscale.com/install.sh | sh

# Rejoindre le réseau
tailscale up --authkey=<authkey>

# Vérifier
tailscale status
```

REX détecte automatiquement les autres nœuds Tailscale au démarrage du daemon.

---

## 7. Vérification complète

```bash
# Health check
rex doctor

# Status daemon
rex status

# Hub API
curl http://localhost:7420/api/health

# Fleet nodes (depuis le Mac)
rex mesh

# Logs
rex logs --follow
```

---

## 8. Firewall

```bash
# Uniquement Tailscale pour le hub (pas d'exposition publique)
ufw allow from 100.64.0.0/10 to any port 7420  # Tailscale range
ufw allow 22   # SSH
ufw enable
```

---

## 9. Mises à jour REX

```bash
cd ~/rex
git pull
pnpm install
pnpm build
npm link packages/cli
systemctl restart rex-daemon rex-gateway
rex doctor
```
