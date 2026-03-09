#!/bin/bash
# Retourne l'état de la fleet en JSON
VPS_STATUS=$(ssh -o ConnectTimeout=3 -o BatchMode=yes keiy@100.112.24.122 "pm2 jlist 2>/dev/null | jq '[.[] | {name,status,cpu,memory}]'" 2>/dev/null || echo "[]")
MAC_CPU=$(top -l 1 -n 0 | awk '/CPU usage/ {print $3}' | tr -d '%' 2>/dev/null || echo "unknown")
MAC_RAM=$(vm_stat 2>/dev/null | python3 -c "
import sys,re
d=dict(re.findall(r'(.+):\s+(\d+)',sys.stdin.read()))
used=(int(d.get('Pages active',0))+int(d.get('Pages wired down',0)))*4096
total=int(sys.argv[1]) if len(sys.argv)>1 else 16*1024**3
print(round(used/total*100,1))
" 2>/dev/null || echo "unknown")
OLLAMA=$(ollama list 2>/dev/null | tail -n +2 | awk '{print $1}' | jq -Rc '[.,inputs]' 2>/dev/null || echo "[]")
echo "{\"vps\": $VPS_STATUS, \"mac\": {\"cpu\": \"$MAC_CPU%\", \"ram\": \"$MAC_RAM%\"}, \"ollama_models\": $OLLAMA}"
