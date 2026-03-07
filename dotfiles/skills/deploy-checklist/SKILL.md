---
name: deploy-checklist
description: Pre-deploy checklist — zero error guarantee. Always run before any production deployment. Use when user says "deploy", "push to prod", "push to beta", "ship it".
disable-model-invocation: true
---

# Deploy Checklist — Production Zero-Error

Run this checklist BEFORE any deployment. $ARGUMENTS can specify the target (beta/prod).

## Avant le deploy

### Code
- [ ] Tous les tests passent localement
- [ ] Build de production réussit (`npm run build`)
- [ ] Pas de warning dans le build output
- [ ] Variables d'env de production configurées

### Git
- [ ] All changes committed? No uncommitted work?
- [ ] On the correct branch?
- [ ] Branch is up to date with remote?

### Base de données
- [ ] Migrations testées sur staging
- [ ] Backup de la DB de production créé
- [ ] Rollback plan documenté

### Infrastructure
- [ ] Monitoring actif (uptime, erreurs)
- [ ] Logs configurés
- [ ] Alertes configurées

### PR status (if deploying from a PR)
- [ ] All CI checks passing?
- [ ] Gemini Code Assist review: any critical issues?
- [ ] GitHub Copilot review: any critical issues?

### Post-deploy
- [ ] Smoke tests sur l'URL de production
- [ ] Vérifier les métriques 15min après deploy
- [ ] Notifier l'équipe

## En cas de problème
1. Rollback immédiat si erreur critique
2. Investiguer les logs
3. Documenter dans DECISIONS.md

## Deploy Decision
- If ANY check fails: STOP and report to user
- If all checks pass: proceed with deploy and confirm target with user

IMPORTANT: Always ask "beta or prod?" if not specified. Never assume prod.
