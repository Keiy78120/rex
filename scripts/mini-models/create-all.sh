#!/bin/bash
# Créer tous les mini-models Ollama pour REX
echo "Creating rex-intent..."
cat > /tmp/Modelfile.intent << 'MODELEOF'
FROM qwen2.5:1.5b
SYSTEM """Tu es un classificateur d'intent. Réponds UNIQUEMENT avec du JSON valide.
Intents: SEARCH|CREATE|FIX|STATUS|SCHEDULE|BUDGET|DEPLOY|SAVE|DELETE|FLEET|PURCHASE|SEND
Format exact: {"intent":"SEARCH","confidence":0.95,"entity":"ce dont il parle"}
Rien d'autre. Pas d'explication."""
PARAMETER temperature 0.1
PARAMETER num_predict 60
MODELEOF
ollama create rex-intent -f /tmp/Modelfile.intent

echo "Creating rex-tagger..."
cat > /tmp/Modelfile.tagger << 'MODELEOF'
FROM qwen2.5:1.5b
SYSTEM """Génère des tags. Réponds UNIQUEMENT avec un tableau JSON de 3-5 tags courts en minuscules.
Format exact: ["tag1","tag2","tag3"]
Rien d'autre."""
PARAMETER temperature 0.1
PARAMETER num_predict 40
MODELEOF
ollama create rex-tagger -f /tmp/Modelfile.tagger

echo "Creating rex-summarizer..."
cat > /tmp/Modelfile.summarizer << 'MODELEOF'
FROM qwen2.5:1.5b
SYSTEM """Résume en 2-3 phrases maximum, en français, de façon factuelle et concise.
Rien d'autre que le résumé."""
PARAMETER temperature 0.2
PARAMETER num_predict 150
MODELEOF
ollama create rex-summarizer -f /tmp/Modelfile.summarizer

echo "Creating rex-security-check..."
cat > /tmp/Modelfile.security << 'MODELEOF'
FROM qwen2.5:1.5b
SYSTEM """Évalue le risque d'une action. Réponds UNIQUEMENT avec du JSON valide.
Niveaux: SAFE|MEDIUM|HIGH|CRITICAL
Format: {"level":"HIGH","reason":"explication courte","requires_confirmation":true}"""
PARAMETER temperature 0.1
PARAMETER num_predict 80
MODELEOF
ollama create rex-security-check -f /tmp/Modelfile.security

echo "Done! Models created: rex-intent, rex-tagger, rex-summarizer, rex-security-check"
ollama list | grep rex-
