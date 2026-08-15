# Clan Muster — design system source

Source of truth for the design system described in the [Clan Muster map](https://github.com/nswanger/clash-of-clans/issues/13). Structure mirrors the Portfolio design-system project, which is the proven pattern.

```
design/
  tokens.css            the single source for color, type, spacing, radii, elevation, layout
  preview/
    _card.css           shared chrome for preview cards; imports tokens.css
    *.html              one card per foundation, rendered as a gallery in Claude Design
```

Preview cards pin themselves to light with `<html data-theme="light">`. They are light documents that *depict* dark where the comparison matters — without the pin, `_card.css` resolves `--cm-bg` dark on a dark-mode viewer while the card's own text stays pinned light.

## Sync direction

**The repo is source of truth. Sync flows repo → Claude Design.**

Claude Design is a gallery for judging foundations side by side, not an editor. Never treat a remote file as authoritative: if the two disagree, the repo wins and the remote gets overwritten on the next push.

Project: `Clan Muster` (`167e1155-58dd-4922-9f1c-b7a691f90af7`), type `PROJECT_TYPE_DESIGN_SYSTEM` — immutable at creation, so it cannot be recreated as a regular project by mistake.

Push with the `DesignSync` tool: `list_files` to diff, `finalize_plan` with the paths to write, then `write_files` reading from this directory. Incremental — one component at a time, never a wholesale replace.

Each preview card carries a first-line `<!-- @dsCard group="…" -->` marker; the Design System pane builds its index from those, so no explicit asset registration is needed.

## Token naming

`--cm-*` (Clan Muster), grouped by role rather than by value. A token names what something *is for*, never what it looks like: `--cm-fg-muted`, not `--cm-grey-3`.

## Status of the values in `tokens.css`

**Color is locked** ([#16](https://github.com/nswanger/clash-of-clans/issues/16)). Every pairing was verified numerically against WCAG AA; nothing was judged by eye.

The shape of the color system, in three rules:

1. **Gold fills, it does not write — in light mode.** Real gold reaches only 2.18:1 as text on white. Darkening it far enough for AA turns it to bronze, which reads muted rather than clickable. So gold is a surface (6.80:1 with dark ink on it); interactive ink uses bronze `gold-700`. In dark mode gold does both. One hue family, luminance shifting by theme, no second accent.
2. **Warm throughout.** The neutral ramp sits at ~40°, gold at 43°, danger at 16°, success warmed to moss at 101°. The app's inherited green sat at 152° and read as foreign.
3. **Unknown carries no hue.** Absent evidence renders as muted text and an em-dash. An absence is not a warning.

Two contrast roles, not one: `--cm-hairline` is decorative and deliberately below 3:1, while `--cm-border-control` clears 3:1 for control boundaries. WCAG 1.4.11 governs the latter, not card edges — forcing every table rule to 3:1 makes a dense roster unreadable. `neutral-500` clears it in both themes, so it is one token rather than a pair.

**Type and density are locked** ([#17](https://github.com/nswanger/clash-of-clans/issues/17)).

- **Archivo, one family**, for UI and display alike — chosen on a phone at true 1:1 size. The app never actually loaded a webfont before this: `styles.css` named Inter with no `@font-face` anywhere, so every user fell through to a system face and Android leaders saw Roboto.
- **7 sizes, floor 12px** (up from 15 sizes and a 9px floor). 11px survives for uppercase labels only.
- **4 weights**; 650, 750 and 800 dropped as indistinguishable at these sizes.
- **Tracking bound to size**, never chosen per use.
- **Density follows the input device**: comfortable is the base, `(pointer: fine)` opts into compact. A failed query lands on the accessible option. `--cm-tap-min: 44px` is never overridden.

**Structure is locked** ([#18](https://github.com/nswanger/clash-of-clans/issues/18)).

- **One 4px rhythm, 7 steps**, absorbing 43 padding and 23 gap values. No sub-4px step: the 1–3px "gaps" in the current CSS are hairline separators, and become borders.
- **Radius is soft (6/10/16) and assigned by class of surface** — `lg` containers, `md` controls, `sm` inline — with a nesting rule that drops exactly one step inward. That rule, not the values, is what stops the 5px-inside-7px-inside-10px soup.
- **Depth is binary, not a scale.** Flat surfaces separate by hairline and background shift; shadow is reserved for something that overlaps other content, and there is one such token. The current CSS already believed this — its two non-overlay shadows sit at 3% and 4% black and are invisible, while both real shadows are on popovers. It is also the only model that survives dark, where shadow cannot separate black from black.
- **The edge marker has two forms.** A full-bleed underline for a segment inside a strip; an inset, pill-capped rail for a standalone row. An `inset` box-shadow follows the border-radius, so at soft radii a rail drawn that way renders as a crescent — caught by rendering it, not by reading the CSS.
- **Focus is solid, not a halo.** A translucent ring composites over whatever sits behind it, so its contrast changes silently on a coloured surface.
- **Two breakpoints, mobile-first** (720px, 1120px), replacing seven ad-hoc `max-width` values. Today's 900/840/800 all meant "multi-column stopped working" and 680/560/480 all meant "phone".

## Not yet decided

How the web app consumes these tokens — importing this directory directly, promoting it to a workspace package under `packages/`, or copying at build time. That is part of [#23](https://github.com/nswanger/clash-of-clans/issues/23), where component API conventions are settled. Nothing in `apps/web` imports this yet.
