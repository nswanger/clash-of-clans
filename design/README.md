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

**Semantic states and the notice budget are locked** ([#19](https://github.com/nswanger/clash-of-clans/issues/19)).

- **Five marks**: success, caution, danger, info, unknown. Colour states an evaluation or a category and never raises a notice.
- **Info marks a category, never a notice** — an access role, an invitation status, lineup provenance. An info-coloured bar is precisely the chrome the budget exists to remove, so the rule is explicit rather than a loaded gun. Info is deliberately the lowest-chroma state (32%, against caution 38%, success 44%, danger 91%).
- **One notice region per screen.** Highest severity wins; additional qualifying notices are counted and expandable, never stacked. Only two things can ever occupy it — collection health, and a save conflict or failed request — and both are danger. Success, caution and info can never appear there.
- **Provenance is marked by presence, not by a pair.** Observed carries the info edge rail; planned carries no marker. "Observed" is not success — it only means the value came from the Clash API — and colouring it as success would imply the plan is deficient.
- **No activity value may be negative.** The domain's three values are `observed`, `no_change` and `unknown` — `no_change`, not "inactive". The data layer already refuses to read absent evidence as poor performance.
- **Two treatments deleted**: the happy-path banner reading "Latest saved lineup", and a permanently mounted documentation paragraph. Both carry a live control, so the action is rehomed rather than lost; where Save lives is #20.

The largest finding was not in the audit, which was CSS-only: `dashboard-model.ts` pushes one `role="alert"` per coverage gap and one per confidence note, unbounded. Those are per-recommendation explanations hoisted out of the panel they explain, and they return to it.

**The mobile lineup adjustment surface is locked** ([#20](https://github.com/nswanger/clash-of-clans/issues/20)), in [`prototype/lineup-adjust.html`](prototype/lineup-adjust.html).

- **The unit of work is the swap, not the list.** Tap a lineup row, get a panel on that member, tap a replacement. Two taps, no drag. That panel is also where full evidence lives and where availability is edited, so the row itself carries only what you scan for.
- **Reordering is a first-class requirement, and gets its own mode.** The plan's order is a hand-kept mirror of in-game base-weight order, which the API does not expose — so it is how a leader tracks who is in and out, not decoration. Reorder mode collapses rows to number, name, Town Hall and a handle: 44px against 82px, so ten rows fit a phone instead of six. It uses pointer events, because the HTML5 drag-and-drop the workspace uses today fires no events on touch at all — the phone has never been able to reorder.
- **Moves are marked by intent, not by index.** Dragging one row past another changes both rows' positions, and a positional diff marks both for one move. Displacement is a consequence, not an edit, so only what you dragged is marked, and dragging something back to where it started un-marks it. Intent has the same lifetime as the draft, so a reload discards both together.
- **The edge marker slot carries provenance and nothing else; edit state is carried by the position number.** Edit state was briefly a second rail colour, which measured **1.12:1 against the info rail in light and 1.05:1 in dark** — two 3px bars 49° apart at the same lightness, and blue-against-violet is the worst pair to hand red-deficient vision. The fix is a different form, not a different hue in the same slot.
- **One persistent action bar** carries Save, the change count, and — expanded — the in-game replication list. This is where [#19](https://github.com/nswanger/clash-of-clans/issues/19) deferred Save to. Day-scoped actions (Re-inherit, Lock day) live in the day strip's own overflow menu, because they act on the day rather than on the lineup.
- **Rows mark the exception, never the rule.** "Available" on thirteen of fifteen rows is the happy-path banner again, one row at a time. A row with nothing to flag carries no second line, so it is visibly shorter and the flagged ones carry the eye.
- **Candidates rank by availability, then rotation need, then rating** — never rating alone, which floats already-secured members to the top and does nothing for bonus fairness.
- **Desktop is the same layout at wider breakpoints, not a second one.** The bench is a bottom sheet below 720px and a docked column above it, from the same markup; the rail (bonus priority, history) appears at 1120px. Column top spacing belongs to the columns grid, not to a section inside the first column.
- **Auto-scroll during a drag is time-based, not frame-based**, with a quadratic ramp: ~33px/s just inside the 96px edge band, 520px/s at the edge. A per-frame step runs at double speed on a 120Hz phone and normal speed on a 60Hz display — invisible when testing on 60Hz, and the reason the first attempt felt wrong on the device it was built for.

Dropped: drag-and-drop between lists, the four-control roster filter row (a single search in the panel, with ranking replacing sort), and the inline availability popover on rows.

**The members roster is locked** ([#22](https://github.com/nswanger/clash-of-clans/issues/22)), in [`prototype/members-roster.html`](prototype/members-roster.html). It is the contrasting proof: list-heavy, read-mostly, per-person, against a lineup workspace that is dense, interactive and decision-making.

- **The system held.** 79 shared rules against 52 lineup-only and 29 members-only; members uses 31 of 37 shared classes. Nothing needed bending. One thing needed renaming — the CWL day strip and the activity-window selector are the same component, and calling it `.daystrip` had hidden that. It is `.segmented`.
- **One genuinely new component: the summary strip.** Neither #20 surface had an aggregate read; a roster does, because "how healthy is the clan" is the question you arrive with.
- **The action bar did not survive, and that is the useful part.** Members has nothing to save, so it has no bottom bar — confirming the bar belongs to editing surfaces rather than to the system.
- **The wall of numbers moves into the panel rather than being deleted.** Today's card is **621px per member** at 390px — six stacked facts, an unbounded evidence list, a freshness line — so a 44-member roster is 33 phone screens of scroll. The row is **62px**, and the list is 3.6 screens. Everything else is one tap away.
- **Rows mark the exception here too.** Today every card carries an `activity-status` pill including the majority saying the ordinary thing. Now `observed` is silent; only `No change observed` and `Building history` are marked, in muted, never negative.
- **Detail is an overlay, not a route** — the same panel component as the lineup, mounted as a sheet below 720px and docked above it.
- **Where the panel is docked it opens on the first member by default.** An empty column is dead space that also hides the fact that rows do anything. The narrow layout never auto-opens, because there the panel covers the list. A docked panel carries no close control — there is nowhere to dismiss it to.
- **Selection is the accent on the border plus a background shift, never the rail.** #18 names `--cm-accent-edge` as the selection colour and the segmented strip uses it that way, but on a row that slot already carries provenance (#20) and a row can be observed and selected at once.
- **The activity window is 1 day and 7 days.** The view hard-codes `baseline_1d`, `baseline_7d` and `baseline_30d` as three lateral joins, and 30 days mostly answers "have they quit" — which `is_current_member` and `departure_observed_on` answer directly. `baseline_30d` is fetched today and never read.
- **Desktop columns are gated on a container query, not the viewport.** The list column's width depends on whether the detail panel is docked beside it, so a viewport breakpoint is wrong in exactly the band where the panel is open on a small desktop — the columns appear, overflow, and push the chevron past the card edge. A header row comes with them, since unlabelled number pairs are unreadable, and header and rows share one explicit track list because two grids size `auto` columns independently.
- **The bottom sheet is shared behaviour.** Slide-up on open, drag the header down to dismiss past 28% of sheet height or on a flick, scrim fading with the thumb, `prefers-reduced-motion` honoured. The header alone is draggable: a sheet that dismisses when you try to scroll its contents is worse than one that never dismisses.

War figures are **all-time**, labelled as such. `regular_war_member_history` has no date filter, so scoping them to the activity window is a data change — [#34](https://github.com/nswanger/clash-of-clans/issues/34), tracked outside this map.

**The pending-changes pattern is locked** ([#21](https://github.com/nswanger/clash-of-clans/issues/21)), in [`prototype/lineup-adjust.html`](prototype/lineup-adjust.html). It is the pattern the redesign exists for: making several swaps here, then switching to Clash on the same phone to replicate them.

- **"Unsaved" and "not yet done in game" are two questions, not one.** They have different baselines — the draft against the saved plan, and the saved plan against the game — and merging them is why the first attempt's list *evaporated on Save*, at exactly the moment you switch apps to act on it. The action bar carries two independent controls, because arbitrating them into one label would be lying about the other.
- **Three lists, and the baseline is a record of physical acts.** `APPLIED_BASE` plus your confirmed check-offs is what the game holds; pending is the saved plan minus that. Because the baseline records what you *did*, it is deliberately not keyed to a revision — so when a revision reverts something you already applied, it correctly reappears as a fresh instruction in the other direction. A key-set diff shows nothing to do there.
- **Order changes are not on the checklist.** The game orders by base weight, which it decides; a move here is you transcribing what Clash already shows, never an instruction to carry back. Moves still gate Save — they are a real edit to the plan of record — but they can never be "not yet done in game".
- **The tool already knows the in-game order.** `cwl_war_members.map_position` is collected, stored, and queried `.order("map_position")` — and the workspace reads `observed` only as a boolean set, throwing the position away. Base *weight* is not in the API; the order it produces is, once the war day exists. Manual reordering is only needed while planning ahead of the war.
- **Removals lead.** At war size the game refuses an add before a remove, so the order the rows are listed in is the order they can be executed. Each swap is one row and one check, not two — the halves are forced adjacent anyway, and splitting them doubles the app switches.
- **Check-off is manual; observation confirms.** Tapping is the only thing that works at the moment of use, standing in the other app. When collection later observes the war roster, it replaces the baseline wholesale — ground truth, not a tick. The checklist keeps its place as you go rather than collapsing, with completed rows kept and undoable.
- **A moved revision is the save-conflict notice**, and it outranks stale collection for the one region ([#19](https://github.com/nswanger/clash-of-clans/issues/19)): stale evidence makes your decision older than you think, but a moved revision makes the list you are physically executing wrong. It fires only when a checklist is part-way through — an untouched list just recomputes silently.
- **Violet marks an unsettled change throughout the surface**, and what it is unsettled *against* is given by where it appears: the position number for the saved plan, the action bar dot for the game.
- **The checklist is the shared panel** — sheet below 720px, docked above it — so it added **zero** rules to the shared layer. Like the action bar, it belongs to editing surfaces rather than to the system.
- **`--cm-on-accent` is gold-specific.** Gold is a light fill wanting dark ink, but success in light mode is a *dark* fill, and `--cm-on-accent` on it measures **2.49:1**. State fills take `--cm-surface` as their ink instead — 6.27:1 light, 8.64:1 dark — because surface inverts with the theme the same way the fill does. #23 owes the inventory a rule here.

The baseline is durable, plan-scoped, **server-side** state, not view state: a half-applied change set is a fact about the clan's war rather than about one phone, so a co-leader who applied the swaps does not leave you redoing them. Persisting it is a data change — [#36](https://github.com/nswanger/clash-of-clans/issues/36), tracked outside this map.

**The component inventory and API conventions are locked** ([#23](https://github.com/nswanger/clash-of-clans/issues/23)), in [`components.md`](components.md) — the full list, with each component's variants and states.

- **Three layers, decided by concept rather than by use count.** *System* means the same thing on any page; *editing* belongs to surfaces that change something; *page* is one surface's own vocabulary. The editing layer earned its name by being found three times independently — neither the action bar nor the in-game checklist survived from the lineup to the members roster.
- **`cm-` prefix on every component class**, matching the tokens. The prototypes use bare names because each is a standalone document; in a shared stylesheet during an incremental migration `.row` collides on contact. This is the one convention that changes rather than ports.
- **State and variants are both compound `is-*` classes**, and a variant is named for the semantic state it expresses rather than the use that first needed it — `.cm-pill.is-caution`, not `.cm-pill.turn`. Variant names come from #19's five marks, so a variant that cannot be named from that list means the component is being asked to carry a meaning the system does not have.
- **Classes carry appearance, data attributes carry behaviour.** Styled classes are never queried; `data-close`, `data-check`, `data-search`, `data-handle` are never styled. A restyle cannot break a click handler.
- **No CSS Modules.** One global component stylesheet ported near-verbatim from `_prototype.css`, with thin React components emitting the classes. Modules would rename every class and break the correspondence between the prototypes and the shipped code — the prototypes are the spec, so a direct port verifies the design by construction.
- **Utilities are capped at five** (`grow`, `count`, `eyebrow`, `empty`, `sep`). An uncapped utility layer becomes Tailwind by hand, which the map ruled out in charting.
- **Two rules were written and proved unreachable, and both are deleted rather than kept as gaps.** `.avail.is-available` is dead because rows mark the exception, so the majority state is never rendered — the row-marking rule pruned the component's own API. `.pill.info` is dead because info's one live form is the provenance rail; #19 gave info a fifth mark and the surfaces only ever needed one shape for it.
- **Two renames**, both where the name recorded a first use rather than a concept: `avail` → `cm-statustext` (the members roster already uses it for "Left 3mo ago"), and `lockchip` → `cm-statuschip`.

**The mark and identity treatment are locked** ([#24](https://github.com/nswanger/clash-of-clans/issues/24)), in [`prototype/identity.html`](prototype/identity.html).

- **One mark with a container variant, not two marks.** A dragon's head cabossed — facing the viewer, no neck — wherever there is room; the same head knocked out of a shield at 16–32px. The badge is generated from the head by transform rather than redrawn, so the two cannot drift as either is refined.
- **The container is what survives shrinking.** At favicon size the bare head degrades toward a generic angular glyph, while the shield still reads unmistakably as a badge — a container holds its identity after its contents have stopped resolving. This was the finding the size test existed to produce, and it is why the answer is two mountings rather than one shape.
- **A dragon reads by vocabulary, not by detail.** The first attempt was a forward-facing head with two horns and it read as a cat. The fix was a crown of horns rather than two, a heavy brow, and a distinct muzzle block. Evenly-spaced radial horns then read as a jester's crown, so the horn pair has to be unequal and swept.
- **A silhouette must be one connected mass.** The profile head drawn as two floating jaws read as two darts; the mouth has to be a notch cut into a single outline. A head is legible because it is one shape, not because it has the right parts.
- **A wyvern displayed was cut.** At 24px the wings and legs collapsed into a five-pointed star — a worse thing to be mistaken for than a generic head.
- **All geometry is original.** Heraldic dragons are a public vocabulary centuries older than the game; nothing here derives from a Supercell asset, which matters because this repo is public and the system is meant to be reusable.
- **Where identity is permitted:** the app mark in the top bar at 20–24px, once per screen; the favicon and app icon; and empty states, muted to a neutral rather than gold, because an empty state is not an achievement.
- **Where it is forbidden:** on rows, as a watermark, as any repeating texture, and — most importantly — carrying a state colour. The moment the mark goes green or red it becomes a sixth semantic mark, and [#19](https://github.com/nswanger/clash-of-clans/issues/19) fixed the set at five. Identity never states an evaluation.
- **No illustration style beyond the mark.** No spot art, no mascot poses, no scenes. The mark is one shape at one weight, recoloured but never redrawn — which is why the empty state reuses it at 56px instead of introducing a second vocabulary.

The vector itself is a working draft, good enough to build against; refining it does not reopen the decision.

**The icon set is locked** ([#40](https://github.com/nswanger/clash-of-clans/issues/40)), in [`prototype/_prototype.js`](prototype/_prototype.js) with its rules in [`components.md`](components.md).

- **Six of the eight icons in the two locked surfaces were silently broken.** Google serves Archivo with `U+2191` and `U+2193` but **not** `U+2192` — up and down arrows, no right arrow — and nothing from Misc Symbols, Braille, or Dingbats. The ellipsis, reorder toggle, drag handle, checkmark, right arrow and star were all rendering in whatever font the platform happened to substitute. This was invisible on the machine they were designed on, which is the same failure mode as #17 finding the app had never loaded a webfont at all.
- **The star was the worst of them**, and it was found by scanning rather than by listing from memory. It appears in every stat column, and `U+2605` renders as a **colour emoji** on some platforms — a coloured glyph in a numeric column, in a system whose colour rules are otherwise exact.
- **Eight inline SVG icons in one `<symbol>` sprite.** No library and no icon font: eight is small enough that a library would be almost entirely unused weight, and an icon font adds a network request plus screen readers announcing private-use codepoints.
- **Sized in em, coloured by `currentColor`.** An icon inherits size and colour from its type context — the one good property the glyphs had, and worth preserving deliberately rather than losing by accident.
- **The rule is role, not coverage:** if it sits in running text it stays a character; if it is an affordance it becomes an icon. That keeps `·` as punctuation in `.sep` and makes `×` and `›` icons even though Archivo has them, so one alignment model governs.
- **Icons are flex items, so whitespace beside them collapses.** Any component mixing icons and text in a flex container needs an explicit `gap` — a space in the markup will not survive. The pill was the one that slipped through.

**The loading pattern is locked** ([#43](https://github.com/nswanger/clash-of-clans/issues/43)), in [`prototype/loading.html`](prototype/loading.html).

- **Loading has no copy.** The personality anchor decides it: uncertainty is expressed structurally, never editorially, and loading is the most literal unknown in the app. So the six ad-hoc `Loading…` strings across five files are deleted rather than systematized. `aria-busy` plus one visually hidden live region carries the announcement, which is why deleting them costs nothing.
- **Nothing renders for the first 250ms.** A placeholder that appears and vanishes inside a tenth of a second is a flash, and reads as breakage rather than progress. The skeleton is *scheduled*, not shown — if the data beats the timer, the skeleton never existed. Most loads will therefore show nothing at all.
- **One primitive, not one per surface.** A skeleton row is `.row` with muted blocks instead of content, so it inherits height, padding, radius and grid from the real row and cannot drift from what it stands in for. Page chrome renders normally, because a skeleton of the chrome is just a slower version of the chrome.
- **The control that triggered a fetch owns its pending state.** On a re-fetch the list does not become a skeleton — replacing populated rows destroys the reader's position to say what the button already said. Save goes pending; the roster stays put.
- **Loading is not a brand moment.** A themed animation on every fetch is the Clash-skinned UI the map ruled out. If one is ever built it is scoped to cold app start, and is a separate decision rather than a swap into this component.

**The migration mechanics are locked** ([#25](https://github.com/nswanger/clash-of-clans/issues/25)), in [`migration.md`](migration.md) — the plan someone executes.

- **`design/` becomes a workspace package without moving.** Add `design` to the `pnpm-workspace.yaml` globs and a `package.json` naming it `@cwl/design`. Moving it under `packages/` would be tidier and is not worth breaking every `DesignSync` and artifact path for.
- **Four waves: tokens alone, then members, then CWL, then conformance.** Tokens land in a deliberately inert commit — if they arrive alongside a rebuilt surface, a visual regression has two possible causes instead of one.
- **Members migrates before CWL.** CWL is the default route and the surface validated against a live season; members is real, cheap to get wrong, and proves the mechanics first.
- **The 80 tests are the safety net, and it is luck rather than design.** All 137 queries are `getByRole` or `getByText` — not one class-name assertion — so a restyle is invisible to them, and CI runs them before build and deploy. Worth stating plainly because it can be lost by accident: *do not add class-based queries to these tests.*
- **A surface migrates all at once, with its old CSS deleted in the same commit.** Collision is impossible by construction since every class is `cm-`-prefixed, so the real hazard runs the other way — an old rule still matching a rebuilt element that kept an old class name.
- **The `cwl-proto-*` rename lands with the rebuild**, never as its own commit. A standalone rename touches every line the rebuild touches anyway, and the tests cannot catch a rename error because they never query by class. One CI grep asserting no `cwl-proto-` survives covers the one failure mode the suite structurally cannot see.
- **No feature flag; a timing constraint instead.** A flag would mean shipping both stylesheets and both component trees on a static Pages deploy with no server, to guard a risk that is really about timing. **The CWL surface must be migrated before 2026-08-30**, when the next season begins.
- **No visual-regression tooling.** The published prototypes are an exact, versioned spec, and comparison is manual — for a six-route personal-scale app, the machinery costs more than the risk.
