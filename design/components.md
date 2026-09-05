# Clan Muster — component inventory and API conventions

Locked by [#23](https://github.com/nswanger/clash-of-clans/issues/23). Derived from two real surfaces — the CWL lineup workspace ([#20](https://github.com/nswanger/clash-of-clans/issues/20), [#21](https://github.com/nswanger/clash-of-clans/issues/21)) and the members roster ([#22](https://github.com/nswanger/clash-of-clans/issues/22)) — not guessed ahead of them.

A third surface, the post-CWL review phase ([#54](https://github.com/nswanger/clash-of-clans/issues/54)), was designed against this inventory rather than alongside it — the first one that had to be, since it does not exist in `apps/web` at all. It needed **no new component and no ninth icon**, which is the inventory's first real test rather than its third derivation. It also carries one recorded fact and still no action bar, which sharpens where the editing layer's boundary actually is: a bar is for holding a draft against a baseline, not for owning any control at all. What it did produce is one promotion and two boundary corrections, recorded below.

The prototypes in [`prototype/`](prototype/) are the reference implementation. Where this document and the prototypes disagree, the prototypes are wrong and should be corrected.

## Three layers

A component's layer is decided by its **concept**, not by how many surfaces happen to use it today. The test is whether it would mean the same thing on a page neither prototype covers.

| Layer | Contains | Ships in |
|---|---|---|
| **System** | Means the same thing on any page. | `clan-muster.css` |
| **Editing** | Belongs to surfaces that change something. | `clan-muster.css` |
| **Page** | One surface's own vocabulary. | The page's own stylesheet |

The editing layer exists because three tickets found the same boundary independently: the action bar did not survive from the lineup to the members roster (#22), and neither did the in-game checklist (#21). Both belong to surfaces that edit, not to the system. Naming the layer tells whoever builds the next editing surface what they inherit for free.

## Conventions

**Prefix.** Every component class is `cm-`, matching the `--cm-*` tokens. The prototypes use bare names (`.row`, `.panel`) because each is a standalone document; in a shared stylesheet during an incremental migration `.row` collides on contact. This is the one place the prototype convention must change rather than port.

**State is a compound `is-*` class**, never a separate element or a modifier baked into the name: `.cm-row.is-selected`, not `.cm-row-selected`. States are adjectives on a thing that already exists.

**Variants are also `is-*`, named for the semantic state they express**, not for the use that first needed them: `.cm-pill.is-caution`, not `.cm-pill.turn`. Variant names come from the five marks in [#19](https://github.com/nswanger/clash-of-clans/issues/19) — success, caution, danger, info, unknown — so a variant that cannot be named from that list is a sign the component is being asked to carry a meaning the system does not have.

**Classes carry appearance; data attributes carry behaviour.** `data-close`, `data-check`, `data-overlay`, `data-search`, `data-handle` are event-delegation hooks and never styled; `.cm-row`, `.cm-panel` are styled and never queried. The split already works in both prototypes and it keeps a restyle from breaking a click handler. The one deliberate exception is `[data-overlay]`, which scopes the bottom-sheet rules — a panel behaves differently when it is overlaying rather than docked, and that is a real distinction rather than a shortcut.

**No CSS Modules.** One global `clan-muster.css` component layer, ported near-verbatim from `_prototype.css`, with thin React components emitting those classes. Modules would rename every class and break the correspondence between the prototypes and the shipped code — the prototypes are the spec, and a direct port means the design is verified by construction rather than by re-reading.

**Selection uses `aria-current` and `aria-pressed` where they apply** — the segmented strip and the availability set are styled off the ARIA attribute rather than a parallel `is-selected` class, so the accessible state and the visible state cannot drift apart.

## Utilities

Capped at five. Additions need justification, because an uncapped utility layer becomes Tailwind by hand — which the map ruled out in charting.

| Utility | Job |
|---|---|
| `cm-grow` | `flex: 1; min-width: 0` on the flexible child of a header row |
| `cm-count` | The muted count beside a section heading (`is-short` turns it danger) |
| `cm-eyebrow` | The small uppercase label above a heading |
| `cm-empty` | Centred muted text where a list would be |
| `cm-sep` | An inline separator in a meta line — text, not a border |

## Icons

Eight, drawn on a 24 grid and shipped as one inline `<symbol>` sprite. No icon library, no icon font: eight is small enough that a library would be almost entirely unused weight, and an icon font adds a second network request plus screen readers announcing private-use codepoints.

`cm-icon` is a system-layer component, not a token — it has a variant, and tokens do not.

```css
.cm-icon { width: 1em; height: 1em; flex: none; vertical-align: -0.125em; }
.cm-icon.is-lg { width: 1.15em; height: 1.15em; }
```

**Sized in em and coloured by `currentColor`**, so an icon inherits both from its type context — the one good property the Unicode glyphs it replaced had. Nothing needs a per-use size, and an icon inside muted text is muted for free.

| id | Use |
|---|---|
| `i-close` | Dismiss a panel |
| `i-chevron` | Row affordance, bench trigger, action-bar disclosure |
| `i-more` | Overflow menu |
| `i-reorder` | Enter reorder mode |
| `i-grip` | Drag handle |
| `i-check` | Checklist item done |
| `i-arrow-right` | Swap direction in the checklist |
| `i-star` | CWL stars, as a unit suffix on a figure |

**The rule: if it sits in running text it stays a character; if it is an affordance it becomes an icon.** That keeps the middle dot in `cm-sep` — punctuation in a sentence, and `U+00B7` is in the font — while everything else becomes SVG regardless of coverage, so one alignment model governs.

**Still eight after #58, and that is the second real test the set has had.** The prototype drew three route icons and the chrome ships without them: `cm-routemenu` is three text rows, and its current item is marked by ink and weight like every other current state in the system. The label is the affordance in a menu, so an icon beside it is decoration, and decoration is not what earns a place in a capped set. A bottom tab set would have needed all three — a 38% increase in the icon set to serve one variant — which is a cost that belonged in the comparison rather than in a later diff.

Decorative icons take `aria-hidden="true"`; the accessible name stays on the button.

**Why this exists:** these were Unicode glyphs until [#40](https://github.com/nswanger/clash-of-clans/issues/40) measured the font. Google serves Archivo with `U+2191` and `U+2193` but **not** `U+2192` — up and down arrows, no right arrow — and nothing from Misc Symbols, Braille, or Dingbats. Six of the eight were rendering in whatever the platform happened to substitute, and `U+2605` renders as a **colour emoji** on some platforms, inside a data column.

**Icons are flex items, so whitespace beside them collapses.** Any component mixing icons and text in a flex container needs an explicit `gap`; a space in the markup will not survive. `cm-pill` is the one that was caught by eye rather than by rule.

## Loading

Locked by [#43](https://github.com/nswanger/clash-of-clans/issues/43). **Loading has no copy.** The personality anchor governs it — uncertainty is expressed structurally, never editorially — and loading is the most literal unknown in the app, so the six ad-hoc `Loading…` strings are deleted rather than restyled.

| Class | Notes |
|---|---|
| `cm-skel` | One muted block. The only primitive. |
| `cm-row.is-skeleton` | `cm-row` with blocks instead of content — inherits height, padding, radius and grid from the real row, so it cannot drift from what it stands in for. |

The tint is `color-mix(in oklab, var(--cm-fg) 13%, transparent)` rather than a new token, so it inverts with the theme for free; a fixed grey is invisible in one theme and glaring in the other. The shimmer sits on top of a shape that already communicates, so it is the first thing `prefers-reduced-motion` removes.

**Three rules:**

1. **Nothing renders for the first 250ms.** A placeholder that appears and vanishes inside a tenth of a second is a flash, and reads as breakage rather than progress. Fast loads therefore show nothing at all, which is the honest rendering of "this was not a wait." The skeleton is *scheduled*, not shown — if the data beats the timer, the timer is cancelled and the skeleton never existed.
2. **One primitive, not one per surface.** The row is the dominant shape, so a skeleton row covers the list, the panel, and most of a route. Page chrome — topbar, segmented strip, section heads — renders normally, because a skeleton of the chrome is just a slower version of the chrome.
3. **The control that triggered a fetch owns its pending state.** On a re-fetch with content already on screen, the list does not become a skeleton: replacing populated rows destroys the reader's position to say what the button already said. Save goes pending; the roster stays put. A background refresh gets nothing, because the freshness line already reports it.

Announcement is `aria-busy` on the region plus one visually hidden live region. That is why deleting the visible strings costs nothing in accessibility terms.

**Loading is not a brand moment.** Identity is the mark only, never UI texture (#24), and a themed animation on every list fetch is the Clash-skinned UI the map ruled out. If one is ever built it is scoped to cold app start — the one place it would actually be seen, given most loads finish under the threshold — and it is a separate decision, not a swap into this component.

## System layer

### Shell and header

| Class | Variants / states | Notes |
|---|---|---|
| `cm-shell` | — | Page container: max width, gutters. |
| `cm-topbar` | — | Eyebrow, `h1`, and a right-hand slot. |
| `cm-topbar-side` | — | The right-hand slot. |
| `cm-statuschip` | `is-on` | Renamed from `lockchip`, which named its first use rather than the concept. #54 is the second use — "bonuses administered" — which is what makes the rename right rather than speculative. |
| `cm-iconbutton` | `is-small` | 44px by default; `is-small` is still 44px of tap target. |
| `cm-mark` | — | The app mark at 24px, first slot in `cm-topbar`. Once per screen (#24). Its React component takes the colour behind it, because the head's cuts are knocked out to that colour and wave 4 put the mark on `--cm-surface` for the first time. |
| `cm-account` | — | The display name as a control. The initial travels, not the name — the name is the widest unbounded string in the chrome and the one piece nobody reads twice; it stays the button's accessible name. Opens sign-out, which the app had no route to at all (#58). |

`cm-topbar` carries four slots after #58: the mark, the route control, the flexible middle, and `cm-topbar-side`. It is the app's only bar.

### Navigation and notice

| Class | Variants / states | Notes |
|---|---|---|
| `cm-segmented` | `aria-current="true"` on the active button | The CWL day strip and the activity-window selector are the same component (#22). Horizontally scrollable, scrollbar hidden. |
| `cm-routebutton` | `aria-expanded` | **The primary nav.** The page's own `h1` is the route control: pressing the page name discloses the routes. Lives in `cm-topbar`, so it adds no band of chrome. |
| `cm-routemenu` | `aria-current="page"` on the active route, `is-trailing` | **The topbar's disclosure menu**, in both its uses — the three routes, and the account control's sign-out. Overlay, `cm-shadow-overlay`, 44px rows. `is-trailing` anchors it to the right edge, where the account control is. |

**The primary nav is the page name** ([#58](https://github.com/nswanger/clash-of-clans/issues/58)). There is no nav bar and no tab bar: after ADR 0002 there are three destinations, one of them role-conditional and one visited monthly, and a permanently-rendered nav pays rent on a decision a leader makes rarely. `cm-topbar` already sits on every surface, so folding the route control into it costs nothing — which is what the two rejected alternatives could not do. A bottom tab set needs a slim app bar above it for the mark *and* contends for the bottom edge that `cm-actionbar` already owns on the default route; a top rail measurably does not fit at 375px once the mark, the product name, three links and the account control are on one line.

**The route menu is system layer, where the day and season menus are page layer.** Same shape, different scope: those are one surface's own overflow of actions, and this is the app's only way between routes.

**It has two uses, not one, and the second was a wave 3 finding.** #58 drew the account control as opening sign-out and did not say what that menu is. It is this one: the topbar has exactly two things that disclose, and both are app-scope rather than surface-scope, so one component covers them. `is-trailing` is the one positional variant in the system and is named as such rather than from #19's five marks, because it expresses which edge the control that opened it sits on — the route control is the bar's first slot and the account control is its last.

**Navigation is deliberately not a `cm-segmented`.** That strip already carries the CWL phase one level down (ADR 0002), and a second one above it is two headers wearing a component.
| `cm-notice` | — | **Danger only.** One region per screen, and only collection health or a save conflict may fill it (#19). It has no success, caution or info variant by design. |

### Section and list

| Class | Variants / states | Notes |
|---|---|---|
| `cm-columns` | — | The one-to-three column grid. Owns the top spacing, because a section inside the first column cannot space the second (#20). |
| `cm-summary` | — | The aggregate strip above a list: two-up on a phone, four across above 720px. **Promoted from the members page layer by #54**, which needed it unchanged — "how healthy is the clan" and "how did the season go" are the same question shape asked of different data. Four metrics, never five; a strip that scrolls clips a metric mid-word, which reads as a bug. |
| `cm-metric` | `is-danger` | One tile in the strip. `is-danger` colours the figure only, and only where the same fact is marked danger on the rows below it — one fact, one colour (#54). There is deliberately no success variant: a zero is the rule, and rules go unmarked. |
| `cm-section` | — | |
| `cm-section-head` | — | Heading, count, and an actions slot. |
| `cm-rows` | — | Vertical stack with a gap. **At most `--cm-list-max-rows` rows** — see below. |
| `cm-row` | `has-pos`, `is-observed`, `is-out`, `is-selected` | |
| `cm-row-pos` | `is-edited` | The position number. Also the surface's edit mark (#20). |
| `cm-row-main` | — | |
| `cm-row-name` | — | |
| `cm-row-meta` | — | The second line. **Absent entirely when there is nothing to flag** — see "Rows mark the exception" below. |
| `cm-row-stats` | — | |
| `cm-row-figure` | — | The prominent number in a row's stat block. Renamed from `row-stars`, which named CWL stars specifically. |
| `cm-row-th` | — | The muted small line under the figure. |
| `cm-chev` | — | |

**A list shows at most ten rows, and everything past that is reached by narrowing** ([ADR 0024](../docs/decisions/0024-design-list-length-and-reveal.md)). `--cm-list-max-rows` is the token; `LIST_MAX_ROWS` in the React system layer is its other half, and the two must not disagree. The rule exists because a box sized from a fixed row count never resizes under a filter, never needs an inner scrollbar inside a page that already scrolls, and does not grow with the clan. Narrowing means `cm-search` today and may mean a pager on a surface whose rows are walked through rather than searched; that is a component decision for that surface, not an exemption. **A list showing less than everything says so** — `N of M shown`, the form the lineup's bench already uses.

`is-observed` draws the 3px provenance rail. That slot carries **provenance and nothing else** — a second state colour there measured 1.12:1 against the first (#20) — so `is-selected` uses a border accent and a background shift instead, and a row can be both at once.

### Marks

| Class | Variants / states | Notes |
|---|---|---|
| `cm-statustext` | `is-unavailable`, `is-unknown` | A coloured status word inside a meta line. Renamed from `avail`: the members roster already uses it for "Left 3mo ago" and "No change observed", so availability was never the concept. |
| `cm-pill` | `is-success`, `is-caution` | |

**No `is-available` variant, and no `is-info` pill.** Both were written and both proved unreachable. `is-available` is dead because rows mark the exception, so the majority state is never rendered — the row-marking rule pruned the component's own API. The info pill is dead because info's one live form is the provenance rail; #19 gave info a fifth mark, and the surfaces only ever needed one shape for it. Neither is a gap to fill later; each is one line if a real need appears.

### Panel

One component, two mountings: a bottom sheet below 720px, docked into a column above it, from the same markup.

| Class | Variants / states | Notes |
|---|---|---|
| `cm-scrim` | `is-entering` | Hidden when docked. |
| `cm-panel` | `is-entering`, `is-settling` | |
| `cm-panel-head` | — | The drag handle when overlaying. Draggable region **only** — a sheet that dismisses when you try to scroll its contents is worse than one that never dismisses. |
| `cm-panel-evidence` | — | The lede under the panel title. |
| `cm-panel-body` | — | Scrolls when overlaying, `overflow: visible` when docked. |
| `cm-panel-label` | — | A label above a group inside the body. |
| `cm-panel-foot` | — | |

`is-entering` and `is-settling` are applied by the shared behaviour layer, not by page code. The entry animation keys on the panel's `aria-label` changing, because panels re-render through `innerHTML` and a naive animate-on-insert replays the slide on every filter tap (#22).

Where a docked panel has no other occupant it opens on the first row by default and carries no close control — there is nowhere to dismiss it to (#22). Where the column has another default occupant, as the lineup's bench does, the panel keeps its close control and closing returns to that default.

### Controls

| Class | Variants / states | Notes |
|---|---|---|
| `cm-button` | `is-block`, `:disabled` | The primary/filled button. |
| `cm-ghost` | `is-danger`, `:disabled` | The secondary button. **Width is auto; the panel foot is what fills** — see below. |
| `cm-search` | — | A single search input. It replaced a four-control filter row (#20); ranking does the work sorting used to. |

**The ghost's full width belonged to the slot, not the button** (wave 3). `cm-ghost` was `width: 100%` from the day it was drawn, because until wave 3 every ghost in the app lived alone in a `cm-panel-foot` and full-width was what that slot wanted. The Admin route is the first surface to put two of them side by side in a row, which turned an unnoticed coincidence into a bug: each button filled the line and the pair stacked one per row. The fill moved to `.cm-panel-foot .cm-ghost`, which is the same split `cm-button.is-block` already made explicit. Nothing at any existing call site changed.

**`is-danger` is the destructive secondary**, added by the same surface — the first one in the app with irreversible controls, revoking access and revoking an invitation. It is named from #19's five marks like every other variant, and it colours the **ink only**: a filled danger button is a large accent surface, and the accent has exactly one of those. The confirmation, not the colour, is what actually guards the act.

**The filled button is `cm-button`** ([#58](https://github.com/nswanger/clash-of-clans/issues/58)). It existed twice as page-layer vocabulary — the lineup's `.donebutton` and the action bar's Save — and never as a system component, because neither prototype needed one outside an editing surface. The sign-in screen is the case that forced it: the only control on the only surface that has one control.

**It is the accent's one large surface in the app.** Gold fills and does not write (#16), so `--cm-on-accent` is the only ink permitted on it, and that rule is what keeps a filled button from appearing anywhere a ghost would do. It takes `--cm-radius-md` and the 44px floor like every other control; nothing about being primary earns an exception to either. The old `.primary-button` blue (`#0075de`) leaves with it — the system has no blue accent, so the sign-in button was never a restyle.

## Editing layer

| Class | Variants / states | Notes |
|---|---|---|
| `cm-actionbar` | — | Fixed to the bottom, respects `env(safe-area-inset-bottom)`. Carries exactly two controls, because "unsaved" and "not yet done in game" are two questions with two baselines (#21). |
| `cm-actionbar-changes` | `is-clean` | Opens the checklist. Disabled when there is nothing outstanding. |
| `cm-actionbar-save` | `:disabled` | |
| `cm-check` | `is-done` | One checklist row, one game action, 44px. |
| `cm-checkgroup` | — | "To do" and "Done" groups. |
| `cm-availset` | `aria-pressed` on the active button | Editing a three-value field inside a panel. |
| `cm-handle` | — | The reorder grip. |
| `cm-reorder-row` | `is-lifted` | The collapsed 44px row used in reorder mode. |

Violet marks an unsettled change throughout an editing surface; **what it is unsettled against is given by where it appears** — the row position number for the saved plan, the action bar dot for the game (#21).

Pointer capture during a drag belongs on the list, not the handle, so the drag survives the re-render each move triggers (#20).

## Page layer

Not components. Listed so the boundary is legible.

**Lineup:** bench trigger, bench column, the bench row (`cwl-benchrow`, a `cm-row` box holding two buttons rather than being one — the primary fills the row and adds, and the chevron is a `cm-iconbutton is-small` that opens the member's panel; [#114](https://github.com/nswanger/clash-of-clans/issues/114) needed availability reachable for a benched member mid-season, and the 14px glyph inside a single button was neither a target nor a discoverable one. A lineup row keeps its one target and its decorative `cm-chev`; a second surface wanting a two-target row is what would promote this to `cm-row` itself), the remove slot (`cwl-panel-remove`, the member panel's "Remove" ghost between availability and the candidates — [#102](https://github.com/nswanger/clash-of-clans/issues/102) moved it out of `cm-panel-foot`, where a docked panel with no height limit put it below every candidate, and kept it off the row so removal is never an accidental tap; [#112](https://github.com/nswanger/clash-of-clans/issues/112) cut the label to the bare verb because the panel title already names the member; it is "Remove" not "Bench" so it cannot be mistaken for the bench panel's trigger), the candidate list box (`cwl-candidates`, the bench's and the swap panel's ten-row box sized from `--cm-list-max-rows` — [#103](https://github.com/nswanger/clash-of-clans/issues/103) brought the bench under ADR 0024, which had named it as the form's origin without ever applying the cap to it), day menu, the desktop rail and its cards, `moved-from` (reorder's own vocabulary), head actions, the roll-call provenance line. That last is deliberately **not** a `cm-notice` ([#96](https://github.com/nswanger/clash-of-clans/issues/96)): that region is danger-only and one per screen, and where a season's availability came from is provenance rather than a fault, so it carries no hue and no alert role.

**Members:** metric tile, list header, facts grid, evidence list, freshness line, filter choices, window row.

**Review:** war-day record, coverage caveat, list header, facts grid, freshness line. The season menu left this list in wave 4 — it is the CWL route's now, not review's.

**Stand down:** the stand-down state itself, plus the roll-call column, its lede, list and name slot. One container, a muted mark, a season line, a label, the clock and a note — and beneath it the roll call. **#96 gave the surface its first list and took away its distinction as the only body with no list, row or control.** What it did not take away is the countdown being the largest object on the page: the roll call is stacked *below* the block rather than beside it, because two column layouts were built and whichever surface took `cm-columns`' main column read as what the page was about (ADR 0002). Stacking is also the order the phone already had, so there is one arrangement at every width.

The panel itself is `cm-panel` in both its documented mountings — docked above 720px, a sheet behind a button below it — and the tick rows are `cm-check` unchanged: both it and the in-game checklist are a leader working down a roster ticking people off, and only the middle slot differs. The list obeys ADR 0024's ten-row cap, which is what lets the box hold its height under a filter without an inner scrollbar; the two page rules that override `cm-` components here (the evidence line's two-line floor, the empty state filling the box) both carry `.cwl-rest-page` as required.

**Admin:** collection-health facts list, the invitation token block, the audit list, the per-row error line, the control row. Conformed against this inventory rather than against a prototype, because wave 3 has none for it — which makes it the inventory's third test and the one that produced the two component changes above.

**The facts grid stayed page layer at its third use**, and that is a decision rather than an oversight. `members-facts`, `cwl-review-facts` and `admin-facts` are the same idea with three different grids for three different readings — two-up for a member's season, label-beside-value for an endpoint and its failure category. A component parameterised by its own grid is a `<div>` with extra steps, so the pattern is named in three places and shared in none.

**Auth:** the shell that carries the three session states. One surface, three states, and the only place the mark appears large; it is page layer because exactly one route renders it.

**#55 confirmed the season menu stays page layer, and wave 4 moved it up one level within that.** Stand down needs it byte-for-byte, which looks like the second use that promoted `cm-summary` and is not: stand down and review are two *phases of one route*, so the menu is still one surface's own overflow. It moved from `cwl-review.css` to `cwl-route.css` as `.cwl-seasonmenu*`, which is where what no single phase owns already lives — and took `cm-routemenu`'s values for the four properties the two menus had drifted apart on.

The season menu is the lineup's day menu at a different scope, and stays page layer for the same reason: both are one surface's own overflow of actions, not a control the system offers. Seasons are deliberately **not** a `cm-segmented` — the strip on that route already carries the phase (ADR 0002), and seasons accumulate without bound while war days and activity windows are fixed small sets.

## What is deliberately not a component

- **A success, caution or info notice.** The notice region takes danger only, and only two things can fill it (#19). Everything else that wants to announce itself is a mark on the thing it describes.
- **A "no changes" or "all good" banner.** Rows and surfaces mark the exception, never the rule. Thirteen "Available" labels on fifteen rows is the happy-path banner again, one row at a time.
- **A loading spinner and an error card.** Not yet designed, and inventing them here would be guessing ahead of a surface that needs them.
- **An empty-state illustration — decided in [#55](https://github.com/nswanger/clash-of-clans/issues/55), and still not a component.** Wave 4's stand-down phase is the surface this was waiting for, and it produced a page-layer state rather than a system-layer one: the body is a countdown with one job and one occupant, not a reusable empty. What it did spend is [#24](https://github.com/nswanger/clash-of-clans/issues/24)'s third identity permission — "muted empty states" — which had never fired because no empty state existed. The mark is the cabossed head at 72px in `--cm-hairline`. Spec: [`prototype/cwl-resting.html`](prototype/cwl-resting.html).
- **A modal dialog.** The panel covers every case both surfaces had. A second overlay form would need a reason neither has produced.
- **A tooltip.** Nothing survived that needed one; evidence goes in the panel.
- **A card.** `cm-row` and `cm-panel` cover the two real shapes. "Card" is a name for a box, not for a concept, and it is how the current CSS ended up with 43 distinct paddings (#14). **#55 tested this and it held.** The stand-down body is the first thing in the app that wanted a plain bordered box with prose in it — `cm-panel` is an overlay sheet and could not serve — and the answer was still no: it carries its own container in the page layer, because what it needs is that one state and not a box shape with a name. A second surface asking is what would change this.
- **A tick and a cross for a data outcome.** #54 wanted them for a per-war-day record and used words instead. #40's line is that an affordance becomes an icon while everything else stays type, and a war day's outcome is not something you press — so the icon set stays at eight.
- **Density or theme variants on any component.** Density follows `(pointer: coarse)` and theme follows the token layer, so surfaces inherit both rather than choosing (#17).

## What this replaced

`apps/web` carried 382 lines of CSS across two global files — 57 classes under the old prototype prefix and 65 in `styles.css` — with no custom properties, 43 distinct paddings and no theme. All of it is gone: the migration ([#25](https://github.com/nswanger/clash-of-clans/issues/25)) finished in wave 4, `styles.css` is one rule, and every surface is built from this inventory. The rules that outlived the migration are in [`README.md`](README.md).
