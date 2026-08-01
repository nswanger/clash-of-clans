# Domain Docs

Engineering skills should consume this repository's domain documentation as follows.

## Before exploring

- Read `CONTEXT.md` at the repository root when it exists.
- Read relevant decisions under `docs/adr/` when they exist.
- If either location does not exist, proceed silently. The `domain-modeling` skill creates them lazily when terms or decisions are resolved.

## File structure

This repository uses a single-context layout:

```text
/
├── CONTEXT.md
├── docs/adr/
└── apps/ and packages/
```

The apps and packages are implementation boundaries within one Clash of Clans product context, not separate domain contexts for agent setup.

## Use the glossary's vocabulary

When output names a domain concept, use the term defined in `CONTEXT.md`. If a needed concept is not defined, note the gap and use `domain-modeling` to resolve it rather than silently introducing competing terminology.

## Flag ADR conflicts

If output contradicts an existing ADR, surface the conflict explicitly rather than silently overriding it.
