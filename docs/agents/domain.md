# Domain docs

How engineering skills consume this repository’s domain documentation.

## Before exploring, read these

- `CONTEXT.md` at the repository root.
- Relevant ADRs under `docs/adr/`.

If either location does not exist, proceed silently. Do not flag its absence or suggest creating it upfront. The domain-modeling flows create these files lazily when terminology or decisions are resolved.

## File structure

This repository uses a single-context layout:

```text
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-example-decision.md
│   └── 0002-example-decision.md
├── apps/
└── packages/
```

## Use the glossary’s vocabulary

When output names a domain concept—in an issue title, refactor proposal, hypothesis, or test name—use the term defined in `CONTEXT.md`. Do not drift to synonyms the glossary explicitly avoids.

If the needed concept is absent, reconsider whether the term belongs to the project or note the gap for the domain-modeling workflow.

## Flag ADR conflicts

If proposed work contradicts an existing ADR, surface that conflict explicitly rather than silently overriding the decision.
