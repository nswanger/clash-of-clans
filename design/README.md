# Clan Muster — design system source

Source of truth for the design system described in the [Clan Muster map](https://github.com/nswanger/clash-of-clans/issues/13). Structure mirrors the Portfolio design-system project, which is the proven pattern.

```
design/
  colors_and_type.css   tokens — the single source for color, type, spacing, radii, elevation
  preview/
    _card.css           shared chrome for preview cards; imports colors_and_type.css
    *.html              one card per foundation, rendered as a gallery in Claude Design
```

## Sync direction

**The repo is source of truth. Sync flows repo → Claude Design.**

Claude Design is a gallery for judging foundations side by side, not an editor. Never treat a remote file as authoritative: if the two disagree, the repo wins and the remote gets overwritten on the next push.

Project: `Clan Muster` (`167e1155-58dd-4922-9f1c-b7a691f90af7`), type `PROJECT_TYPE_DESIGN_SYSTEM` — immutable at creation, so it cannot be recreated as a regular project by mistake.

Push with the `DesignSync` tool: `list_files` to diff, `finalize_plan` with the paths to write, then `write_files` reading from this directory. Incremental — one component at a time, never a wholesale replace.

Each preview card carries a first-line `<!-- @dsCard group="…" -->` marker; the Design System pane builds its index from those, so no explicit asset registration is needed.

## Token naming

`--cm-*` (Clan Muster), grouped by role rather than by value. A token names what something *is for*, never what it looks like: `--cm-fg-muted`, not `--cm-grey-3`.

## Status of the values in `colors_and_type.css`

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

**Still provisional** — spacing, radii and elevation, pending [#18](https://github.com/nswanger/clash-of-clans/issues/18).

## Not yet decided

How the web app consumes these tokens — importing this directory directly, promoting it to a workspace package under `packages/`, or copying at build time. That is part of [#23](https://github.com/nswanger/clash-of-clans/issues/23), where component API conventions are settled. Nothing in `apps/web` imports this yet.
