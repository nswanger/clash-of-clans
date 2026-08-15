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

**Provisional.** They are the current de-facto values extracted in the [UI inventory audit](../docs/design/ui-inventory-audit.md) — the handful actually doing work today, out of the 100 distinct colors in the live CSS. They exist so the scaffold renders something real and so [#16](https://github.com/nswanger/clash-of-clans/issues/16), [#17](https://github.com/nswanger/clash-of-clans/issues/17), and [#18](https://github.com/nswanger/clash-of-clans/issues/18) have a concrete baseline to diff against.

They are **not** decisions. Every value here is expected to change:

- Color — [#16](https://github.com/nswanger/clash-of-clans/issues/16). Today's palette is blue-accented; the system moves to a warm gold accent over a neutral base, dark-ready.
- Type — [#17](https://github.com/nswanger/clash-of-clans/issues/17). Today's scale bottoms out at 9px, with 35 declarations at 11px or below. Raising that floor is the priority.
- Spacing, radii, elevation — [#18](https://github.com/nswanger/clash-of-clans/issues/18).

## Not yet decided

How the web app consumes these tokens — importing this directory directly, promoting it to a workspace package under `packages/`, or copying at build time. That is part of [#23](https://github.com/nswanger/clash-of-clans/issues/23), where component API conventions are settled. Nothing in `apps/web` imports this yet.
