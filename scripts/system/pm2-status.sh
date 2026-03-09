#!/bin/bash
# Usage: ./pm2-status.sh [service_name]
SERVICE="${1:-rex}"
pm2 jlist 2>/dev/null | jq --arg s "$SERVICE" '[.[] | select(.name==$s) | {name,status,cpu,memory,restarts,uptime:.pm2_env.pm_uptime}]' || echo "[]"
