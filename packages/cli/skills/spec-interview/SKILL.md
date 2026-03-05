---
name: spec-interview
description: Interview the user to write a complete feature spec before coding. Use when user says "/spec-interview" or "interview me about" a feature.
disable-model-invocation: true
---

# Feature Spec Interview

I want to build: $ARGUMENTS

Interview me in depth using the AskUserQuestion tool. Cover:
- Technical implementation and architecture choices
- UI/UX and user flows
- Edge cases and failure modes
- Security implications
- Performance at scale (10x users/requests)
- Tradeoffs and alternatives considered

Don't ask obvious questions. Dig into the hard parts I haven't thought through.
Keep interviewing until we've covered everything, then write a complete spec to `SPEC.md`.
