---
status: accepted
date: 2026-08-16
deciders: [Nick]
type: design
supersedes:
---
# Icons are eight inline SVG symbols, em-sized and currentColor; affordances become icons, text stays characters

## Context
Six of eight glyphs in the locked surfaces were silently rendering in substituted fonts (Archivo lacks `U+2192` and the symbol blocks); `U+2605` renders as a colour emoji on some platforms. Alternatives: an icon library; an icon font. Locked in [#40](https://github.com/nswanger/clash-of-clans/issues/40); rules in `design/components.md`.

## Decision
One `<symbol>` sprite of eight inline SVG icons, sized in em and coloured by `currentColor`. The rule is role, not coverage: in running text it stays a character; if it is an affordance it becomes an icon (`·` stays punctuation; `×` and `›` are icons). Icons are flex items, so components mixing icons and text need an explicit `gap`.

## Consequences
- No icon library, no icon font, no private-use codepoints.
- A ninth icon is a finding against the inventory, not an addition.
