# UI inventory audit

Resolves [#14](https://github.com/nswanger/clash-of-clans/issues/14) for the [Clan Muster map](https://github.com/nswanger/clash-of-clans/issues/13). Raw material for the token, semantic-state, and component-inventory decisions.

Measured at commit `6b466a9` across `apps/web/src/styles.css` (223 lines) and `apps/web/src/cwl-lineup/cwl-lineup-workspace.css` (159 lines) — 382 lines defining **121 distinct class selectors** for six routes.

## Headline

| Dimension | Distinct values today | Roughly what a system needs |
|---|---|---|
| Colors (hex) | **100** (+10 `rgb()`) | 12–15 semantic roles over one ramp |
| Font sizes | 15 (+4 `clamp()`) | 6–8 steps |
| Font weights | 8 | 3–4 |
| Letter-spacing | 9 | 2–3, bound to size |
| Border radii | 13 | 3–4 |
| Padding values | 43 | a scale of ~7 |
| Gap values | 23 | same scale |
| Box shadows | 6 | 2–3 elevations |
| Breakpoints | 7 | 2–3 |
| Button treatments | 13 | 1 component, 3–4 variants |
| Page shells | 5 | 1 |

Nothing here is defined once. There is not a single CSS custom property in either file.

## Color

100 distinct hex values, dominated by a handful doing real work:

| Value | Uses | Role in practice |
|---|---|---|
| `#fff` | 32 | Surface |
| `#6f6e6b` | 26 | Muted text |
| `#e6e6e6` | 22 | Border |
| `#0075de` | 15 | Primary accent |
| `#78aede`, `#777571`, `#31302e`, `#11603b` | 7 each | Accent hover, muted alt, body text, success |

The long tail is the problem: **54 of the 100 appear exactly once.** Many are near-identical neighbours — `#e6e6e6` / `#e0dfdc` / `#e1e0dd` / `#dfdedb` / `#ecebe9` / `#eeedeb` are six different borders that read as one; `#6f6e6b` / `#777571` / `#84817c` / `#8d8984` / `#9a968f` are five muted greys. These are not decisions, they are drift.

Semantic families are present but undeclared — blue (info/primary), green (`#11603b`, `#2a9d99`, `#e5f5ec`), amber (`#c68b0a`, `#f8f1d9`, `#fff4cf`), orange-red (`#dd5b00`, `#793400`, `#fbede4`), purple (`#391c57`, `#d6b6f6`, `#eee8fb`). Each was invented at its call site.

**Note for [#16](https://github.com/nswanger/clash-of-clans/issues/16):** an amber/gold family already exists organically. The gold accent is less of a departure than it sounds.

## Type

Sizes, by frequency: `12px` (27), `13px` (20), `11px` (17), `10px` (14), `14px` (7), `9px` (4), then singletons at 16/17/20/32px and four `clamp()` display sizes.

**35 declarations set text at 11px or smaller, and 18 at 10px or smaller.** On a phone — the primary surface for lineup adjustment — this is the single largest legibility problem in the current UI, and likely a real part of why it reads as clunky. It also collides with the map's AA contrast constraint: small text needs higher contrast, and the muted greys above are already borderline.

Weights: 400, 500, 600, **650**, 700, **750**, 800. The 650 and 750 steps are arbitrary and mostly indistinguishable from their neighbours at these sizes.

Letter-spacing: nine values from `-2px` to `.04em`, mixing units. The negative tracking is applied to display sizes (sensible); `.04em` appears on small uppercase labels (also sensible). The system is right in spirit and undefined in practice.

## Structure

- **Padding: 43 distinct values.** `9px 11px`, `11px 14px`, `12px 14px`, and `13px` all coexist, differences no one can perceive.
- **Gaps: 23 values** including `1px`, `2px`, `3px` used as hairline separators — a border doing a layout job.
- **Radii: 13 values.** `5px`, `6px`, `7px`, `8px`, `9px`, `10px`, `12px` are seven steps where three would do. `999px` (pill) and `50%` (avatar) are legitimate and should survive as named tokens.
- **Shadows: 6**, ranging from a barely-visible three-layer stack on `.dashboard-shell` to `0 8px 24px rgb(0 0 0 / 12%)`. Two are `inset` and are really selection indicators, not elevation.

## Responsive

Seven ad-hoc `max-width` breakpoints: 480, 560, 680, 800, 840, 900, 1100. Each was added for one component. There is no shared set, so a change at one width has unpredictable effects at others.

Container widths are hardcoded per shell: `min(1080px, …)` for the dashboard, `min(1500px, …)` for the CWL workspace, `min(480px, …)` for access.

`prefers-reduced-motion` is handled — the one accessibility affordance already in place, worth preserving.

## Status and notice treatments

The map calls out 14 status/notice classes. Examined individually, **they are not 14 notices** — they are a mix of three different things filed under one naming convention:

### Genuinely actionable notices (keep, in some form)

| Class | Fires when | Action offered |
|---|---|---|
| `cwl-proto-status.is-stale` | Another leader saved or locked the day | Reload latest |
| `cwl-proto-rotation-attention` | Rotation opportunity exists | Preview / revert rotation |
| `dashboard-feedback-error` | A refresh failed | Retry refresh |

### Structural states misfiled as status (convert to state, not notice)

| Class | What it actually is |
|---|---|
| `cwl-proto-slot-state` | Per-slot badge: "Observed" / "Planned" |
| `cwl-proto-bonus-status` | Per-member badge: "Qualified" / "Below 8★" |
| `cwl-proto-pool-status` | A layout container for badges + availability control — not a status at all |
| `activity-status` | Per-member activity indicator |
| `access-status` | Per-account role indicator |
| `empty-state` | Empty collection placeholder |

### Ambient chrome that earns nothing (strong delete candidates)

`cwl-proto-status` renders a **permanent banner in the happy path**. Its four states are "This plan is out of date", "Day is locked for editing", "Unsaved lineup changes", and — when everything is fine — **"Latest saved lineup"**. A persistent bar announcing that nothing is wrong is precisely the anxious chrome the map rules out.

`cwl-proto-inline-notice` is a permanently mounted paragraph of documentation:

> *"Planned lineup is the editable leader plan. Observed lineup comes from the Clash API after the war starts. Each new day inherits once, then stays independent."*

True, useful once, and mounted forever above the workspace. This is onboarding copy occupying prime vertical space on a 390px screen.

`operational-state` and `dashboard-warning` overlap heavily with each other and with `dashboard-feedback`; `dashboard-warning` appears across four files with no consistent meaning.

**Conclusion for [#19](https://github.com/nswanger/clash-of-clans/issues/19):** the notice budget is likely satisfiable with **three** notice treatments (actionable / error / ambient-info) plus a proper state-badge component. Nine of the fourteen are badges or containers that should never have looked like notices, and two should be deleted outright.

## Component families and near-duplicates

**Buttons — 13 treatments, none composable.** Five named classes (`.primary-button`, `.cwl-proto-primary-button`, `.cwl-proto-secondary-button`, `.cwl-proto-history-button`, `.cwl-proto-revert-button`) plus eight selectors styling a bare `<button>` by ancestor (`.access-actions button`, `.recommendation-refresh button`, `.cwl-proto-day-strip button`, …). The ancestor-scoped ones are the worst offenders: a button's appearance depends on where it happens to sit.

**Page shells — 5 near-identical containers.** `.app-shell`, `.access-shell`, `.dashboard-shell`, `.members-shell`, `.cwl-proto-shell` each redefine width, margin, and padding. One layout primitive with a width variant covers all five.

**Card-like surfaces — 65 `border-radius` declarations** across 121 selectors. The border + radius + background triad recurs constantly with no shared definition.

**Badges — only 2 exist** (`.cwl-proto-member-badge`, `.cwl-proto-rotation-badge`) despite the nine structural states above needing exactly this. The component that is most needed is the one least built.

## Implications for downstream tickets

- **[#16 palette](https://github.com/nswanger/clash-of-clans/issues/16)** — collapse 100 values to a neutral ramp plus semantic families. An amber/gold family already exists to build on. Six near-identical borders and five near-identical greys set the ramp's real granularity.
- **[#17 type](https://github.com/nswanger/clash-of-clans/issues/17)** — the 11px-and-below cluster is the priority. Raising the floor is likely the single highest-impact change for mobile. Drop the 650/750 weights.
- **[#18 structure](https://github.com/nswanger/clash-of-clans/issues/18)** — 43 paddings and 23 gaps collapse to one scale; 13 radii to 3–4 plus pill and circle; 6 shadows to 2 elevations, with the 2 `inset` rules reclassified as selection indicators.
- **[#19 states](https://github.com/nswanger/clash-of-clans/issues/19)** — start from the three-way split above rather than from the raw count of 14.
- **[#23 components](https://github.com/nswanger/clash-of-clans/issues/23)** — button, shell, card, and badge are the four load-bearing primitives. Ancestor-scoped button styling must not survive.
- **[#20](https://github.com/nswanger/clash-of-clans/issues/20) / [#22](https://github.com/nswanger/clash-of-clans/issues/22) surfaces** — seven ad-hoc breakpoints should become a declared set before either surface is designed.
