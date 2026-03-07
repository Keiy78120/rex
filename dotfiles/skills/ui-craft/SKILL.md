---
name: ui-craft
description: Visual UI execution — 4px grid, typography scale, hierarchy, motion. Activate for any UI task.
---
# UI Craft — Visual Execution

## Anti-patterns interdits
- JAMAIS Inter/Roboto par défaut — choisir une font qui correspond au projet
- JAMAIS fond blanc + gradient violet — "AI slop"
- JAMAIS hero section générique

## Système de design
Avant toute UI :
1. Définir : couleur primaire, neutre, accent
2. Définir : font title + font body
3. Définir : spacing scale (4px grid : 4/8/16/24/32/48px)
4. Écrire les tokens dans un fichier tokens.css ou équivalent

## Execution
- Typography : 3 niveaux max (title/body/caption), contrast ratio WCAG AA minimum
- Spacing : toujours multiple de 4px
- Motion : 200ms ease-out pour micro-interactions, 300ms pour transitions page
- Backgrounds : préférer atmosphériques (gradients subtils, textures légères) au flat blanc
- Cards : border-radius cohérent dans tout le projet (choisir 6, 8, ou 12px et ne jamais varier)

## Checklist avant livraison
- [ ] Tous les espacements sont multiples de 4px ?
- [ ] Contrast ratio AA respecté sur tous les textes ?
- [ ] Mobile-first ou responsive vérifié ?
- [ ] États hover/focus/disabled définis pour chaque composant interactif ?
