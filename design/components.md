# Clan Muster — component inventory and API conventions

Locked by [#23](https://github.com/nswanger/clash-of-clans/issues/23). Derived from two real surfaces — the CWL lineup workspace ([#20](https://github.com/nswanger/clash-of-clans/issues/20), [#21](https://github.com/nswanger/clash-of-clans/issues/21)) and the members roster ([#22](https://github.com/nswanger/clash-of-clans/issues/22)) — not guessed ahead of them.

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

## System layer

### Shell and header

| Class | Variants / states | Notes |
|---|---|---|
| `cm-shell` | — | Page container: max width, gutters. |
| `cm-topbar` | — | Eyebrow, `h1`, and a right-hand slot. |
| `cm-topbar-side` | — | The right-hand slot. |
| `cm-statuschip` | `is-on` | Renamed from `lockchip`, which named its first use rather than the concept. |
| `cm-iconbutton` | `is-small` | 44px by default; `is-small` is still 44px of tap target. |

### Navigation and notice

| Class | Variants / states | Notes |
|---|---|---|
| `cm-segmented` | `aria-current="true"` on the active button | The CWL day strip and the activity-window selector are the same component (#22). Horizontally scrollable, scrollbar hidden. |
| `cm-notice` | — | **Danger only.** One region per screen, and only collection health or a save conflict may fill it (#19). It has no success, caution or info variant by design. |

### Section and list

| Class | Variants / states | Notes |
|---|---|---|
| `cm-columns` | — | The one-to-three column grid. Owns the top spacing, because a section inside the first column cannot space the second (#20). |
| `cm-section` | — | |
| `cm-section-head` | — | Heading, count, and an actions slot. |
| `cm-rows` | — | Vertical stack with a gap. |
| `cm-row` | `has-pos`, `is-observed`, `is-out`, `is-selected` | |
| `cm-row-pos` | `is-edited` | The position number. Also the surface's edit mark (#20). |
| `cm-row-main` | — | |
| `cm-row-name` | — | |
| `cm-row-meta` | — | The second line. **Absent entirely when there is nothing to flag** — see "Rows mark the exception" below. |
| `cm-row-stats` | — | |
| `cm-row-figure` | — | The prominent number in a row's stat block. Renamed from `row-stars`, which named CWL stars specifically. |
| `cm-row-th` | — | The muted small line under the figure. |
| `cm-chev` | — | |

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
| `cm-ghost` | `:disabled` | The secondary button. |
| `cm-search` | — | A single search input. It replaced a four-control filter row (#20); ranking does the work sorting used to. |

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

**Lineup:** bench trigger, bench column, day menu, the desktop rail and its cards, `moved-from` (reorder's own vocabulary), head actions.

**Members:** summary strip, metric tile, list header, facts grid, evidence list, freshness line, filter choices, window row.

## What is deliberately not a component

- **A success, caution or info notice.** The notice region takes danger only, and only two things can fill it (#19). Everything else that wants to announce itself is a mark on the thing it describes.
- **A "no changes" or "all good" banner.** Rows and surfaces mark the exception, never the rule. Thirteen "Available" labels on fifteen rows is the happy-path banner again, one row at a time.
- **A loading spinner, an empty-state illustration, an error card.** Not yet designed, and inventing them here would be guessing ahead of a surface that needs them.
- **A modal dialog.** The panel covers every case both surfaces had. A second overlay form would need a reason neither has produced.
- **A tooltip.** Nothing survived that needed one; evidence goes in the panel.
- **A card.** `cm-row` and `cm-panel` cover the two real shapes. "Card" is a name for a box, not for a concept, and it is how the current CSS ended up with 43 distinct paddings (#14).
- **Density or theme variants on any component.** Density follows `(pointer: coarse)` and theme follows the token layer, so surfaces inherit both rather than choosing (#17).

## What this replaces

`apps/web` today carries 382 lines of CSS across two global files — 57 `cwl-proto-*` classes and 65 in `styles.css` — with no custom properties. Migration mechanics are [#25](https://github.com/nswanger/clash-of-clans/issues/25).
