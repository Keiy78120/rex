#!/bin/bash
# Usage: ./save-idea.sh "Mon idée" [tags...]
IDEA="${1:?Usage: save-idea.sh <idea> [tags]}"
DATE=$(date +%Y-%m-%d)
TIME=$(date +%H:%M)
SLUG=$(echo "$IDEA" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd '[:alnum:]-' | cut -c1-40)
DIR="$HOME/.rex/memory/ideas"
mkdir -p "$DIR"
FILE="$DIR/${DATE}-${SLUG}.md"
cat > "$FILE" << MDEOF
# $IDEA
> Créé le $DATE à $TIME

## Contexte
<!-- Ajouter le contexte ici -->

## Détails
$IDEA

## Actions
- [ ] À définir

## Tags
${@:2}
MDEOF
echo "{\"saved\": \"$FILE\", \"slug\": \"$SLUG\"}"
