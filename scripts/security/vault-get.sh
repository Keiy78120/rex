#!/bin/bash
# Usage: ./vault-get.sh "service_name" [field]
# Requires: bw CLI unlocked
SERVICE="${1:?Usage: vault-get.sh <service> [field]}"
FIELD="${2:-password}"
bw list items --search "$SERVICE" 2>/dev/null \
  | jq -r --arg f "$FIELD" '.[0] | if $f == "password" then .login.password elif $f == "username" then .login.username elif $f == "url" then .login.uris[0].uri else .fields[] | select(.name==$f) | .value end' 2>/dev/null
