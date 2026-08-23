# Clan Muster — design system source

Source of truth for the design system described in the [Clan Muster map](https://github.com/nswanger/clash-of-clans/issues/13). Structure mirrors the Portfolio design-system project, which is the proven pattern.

```
design/
  tokens.css            the single source for color, type, spacing, radii, elevation, layout
  preview/
    _card.css           shared chrome for preview cards; imports tokens.css
    *.html              one card per foundation, rendered as a gallery in Claude Design
  prototype/
    _prototype.css      the shared component layer — used by more than one surface
    _prototype.js       the shared behaviour layer — currently the bottom sheet
    *.html              whole working surfaces, built against real-shaped data
```

The `_prototype.*` split is a test, not just tidiness: a component that had to be
bent to fit the second surface would be a fault in the system rather than a
special case of the page, so the file boundary is where that shows up.

Preview cards and prototypes answer different questions. A card puts one
foundation next to its alternatives so a value can be judged; a prototype is a
whole surface you operate, because some questions only answer themselves under a
thumb. Prototypes carry a synthetic roster of the live clan's real scale — never
real player tags, which must not enter this public repo.

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

The four foundations are locked; the rules below are what binds, and the *why* is in the decision records.

**Color is locked** ([#16](https://github.com/nswanger/clash-of-clans/issues/16) · [0012](../docs/decisions/0012-design-color-gold-fills-never-writes.md)). Every pairing was verified numerically against WCAG AA.

1. **Gold fills, it does not write — in light mode.** Gold is a surface; interactive ink is bronze `gold-700`. In dark mode gold does both. One hue family, no second accent.
2. **Warm throughout.** Neutrals ~40°, gold 43°, danger 16°, success moss 101°.
3. **Unknown carries no hue.** Absent evidence renders as muted text and an em-dash.

Two contrast roles: `--cm-hairline` is decorative and below 3:1; `--cm-border-control` clears 3:1 for control boundaries (WCAG 1.4.11). `neutral-500` clears it in both themes, so it is one token.

**Type and density are locked** ([#17](https://github.com/nswanger/clash-of-clans/issues/17) · [0013](../docs/decisions/0013-design-type-density-and-structure.md)).

- **Archivo, one family**, for UI and display.
- **7 sizes, floor 12px**; 11px for uppercase labels only.
- **4 weights.**
- **Tracking bound to size**, never chosen per use.
- **Density follows the input device**: comfortable is the base, `(pointer: fine)` opts into compact; a failed query lands on the accessible option. `--cm-tap-min: 44px` is never overridden.

**Structure is locked** ([#18](https://github.com/nswanger/clash-of-clans/issues/18) · [0013](../docs/decisions/0013-design-type-density-and-structure.md)).

- **One 4px rhythm, 7 steps.** No sub-4px step; 1–3px gaps are hairline borders.
- **Radius is soft (6/10/16), assigned by class of surface** — `lg` containers, `md` controls, `sm` inline — nesting drops exactly one step inward.
- **Depth is binary.** Flat surfaces separate by hairline and background shift; one shadow token, reserved for overlap.
- **The edge marker has two forms.** A full-bleed underline for a segment inside a strip; an inset, pill-capped rail for a standalone row (not an `inset` box-shadow — it renders as a crescent at soft radii).
- **Focus is solid, not a halo.**
- **Two breakpoints, mobile-first**: 720px and 1120px.

**Semantic states and the notice budget are locked** ([#19](https://github.com/nswanger/clash-of-clans/issues/19) · [0014](../docs/decisions/0014-design-semantic-states-and-notice-budget.md)).

- **Five marks**: success, caution, danger, info, unknown. Colour states an evaluation or a category and never raises a notice.
- **Info marks a category, never a notice**; it is the lowest-chroma state.
- **One notice region per screen.** Highest severity wins; extras are counted and expandable, never stacked. Only collection health and a save conflict / failed request may occupy it — both danger.
- **Provenance is marked by presence, not by a pair.** Observed carries the info edge rail; planned carries no marker. Observed is not success.
- **No activity value may be negative.** The values are `observed`, `no_change`, `unknown`.
- **No happy-path banner and no permanently mounted documentation paragraph.** Per-recommendation explanations live in the panel they explain.

## Locked surfaces and patterns

Each lock names its reference prototype (the spec — where this document and a prototype disagree, the prototype is wrong and is corrected) and the decision record that holds its rules and rationale.

| Lock | Issue | Reference | Record |
|---|---|---|---|
| Mobile lineup adjustment surface | [#20](https://github.com/nswanger/clash-of-clans/issues/20) | [`prototype/lineup-adjust.html`](prototype/lineup-adjust.html) | [0015](../docs/decisions/0015-design-lineup-surface-swap-not-drag.md) |
| Pending-changes pattern | [#21](https://github.com/nswanger/clash-of-clans/issues/21) | [`prototype/lineup-adjust.html`](prototype/lineup-adjust.html) | [0016](../docs/decisions/0016-design-pending-changes-two-baselines.md) |
| Members roster | [#22](https://github.com/nswanger/clash-of-clans/issues/22) | [`prototype/members-roster.html`](prototype/members-roster.html) | [0017](../docs/decisions/0017-design-members-roster-row-and-panel.md) |
| Component inventory and API conventions | [#23](https://github.com/nswanger/clash-of-clans/issues/23) | [`components.md`](components.md) | [0018](../docs/decisions/0018-design-component-layers-and-api.md) |
| Mark and identity treatment | [#24](https://github.com/nswanger/clash-of-clans/issues/24), [#58](https://github.com/nswanger/clash-of-clans/issues/58) | [`prototype/identity.html`](prototype/identity.html) | [0019](../docs/decisions/0019-design-identity-mark-once-per-screen.md) |
| Icon set | [#40](https://github.com/nswanger/clash-of-clans/issues/40) | [`prototype/_prototype.js`](prototype/_prototype.js), rules in [`components.md`](components.md) | [0020](../docs/decisions/0020-design-icons-inline-svg-sprite.md) |
| Loading pattern | [#43](https://github.com/nswanger/clash-of-clans/issues/43) | [`prototype/loading.html`](prototype/loading.html) | [0021](../docs/decisions/0021-design-loading-no-copy-250ms.md) |
| Post-CWL review phase | [#54](https://github.com/nswanger/clash-of-clans/issues/54) | [`prototype/cwl-review.html`](prototype/cwl-review.html) | [0022](../docs/decisions/0022-design-post-cwl-review-surface.md) |

**`apps/web` is built entirely from these tokens and components** ([#25](https://github.com/nswanger/clash-of-clans/issues/25)). Four rules bind on every future change to it:

- **A page stylesheet prefixes with its own surface's name, and must out-specify the component layer.** The prototypes name page classes bare — `.metric`, `.row-stats` — and those collide, so a page takes `members-`, `cwl-review-`, `cwl-rest-` and so on. More subtly: a bundler orders stylesheets by import graph, so a page stylesheet imported from its own module lands **before** `clan-muster.css` and loses every tie. **Every page-layer rule that overrides a `cm-` component needs an ancestor in the selector.** The members roster found this when `cm-row-stats`'s `display: flex` beat a page-layer `display: none`; the Admin route hit it again a wave later. CSS fails silently here — nothing in CI catches it.
- **No query in the test suites may name a class.** Every query is `getByRole` or `getByText`, which is what makes a restyle invisible to the suite and what lets a surface be rebuilt without touching the tests that guard the others. It was luck rather than design originally, so it is worth stating plainly: *do not add class-based queries to these tests.* A rebuilt surface's own tests move with it; every other surface's must keep passing untouched.
- **The e2e fixture is a hand-maintained stub, and it lies when it drifts.** `apps/web/src/test/e2e-client.ts` is not a database. A filter is honoured only where the fixture actually models the column, since several tables are written as the columns their loader selects and omit the scoping ones; and a table read with `maybeSingle` may be fixtured as a bare object where another is a list. Anything the app reads against the clock has to be **dated from the clock** in the fixture rather than written out — wave 4's phase markers turned written-out dates into a suite that would have gone red on a date rather than on a change.
- **Appearance is verified by hand against the published prototypes, at 375px and 1280px in both themes.** There is no visual-regression tooling: for an app this size the machinery costs more than the risk, and the prototypes are an exact, versioned spec already. A surface that disagrees with the inventory is a finding to record in [`components.md`](components.md), never a licence to invent a component or a token inside one page.

**One CI step survives from the migration**: `deploy-pages.yml` fails the build if the pre-Clan-Muster class prefix reappears anywhere in `apps/web/src`. The rename it guarded is complete, so its only remaining job is catching a resurrection — cheap enough to keep. It assembles the prefix at runtime so the check cannot match itself, and anything documenting that prefix has to do the same.
