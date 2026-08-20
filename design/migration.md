# Migrating `apps/web` onto Clan Muster

Locked by [#25](https://github.com/nswanger/clash-of-clans/issues/25). This is the last decision on the map — after it, rebuilding a page is execution work.

## The deadline

**The CWL lineup surface must be migrated before 2026-08-30**, when the next CWL season begins. It is the default route and the one surface validated against a live season; migrating it mid-season is the only genuinely risky thing in this plan, and the two-week gap removes that risk entirely rather than mitigating it.

Nothing else here is time-boxed.

## How the stylesheets get in

`design/` becomes a workspace package **without moving**: add `design` to the `packages` globs in `pnpm-workspace.yaml`, and a `design/package.json` naming it `@cwl/design` with the CSS files in `exports`.

```ts
import "@cwl/design/tokens.css";
import "@cwl/design/clan-muster.css";
```

Moving `design/` under `packages/` would be tidier and is not worth it — `DesignSync` and every published artifact link point at the current path, and a rename buys nothing the globs do not.

Both imports go in `main.tsx` beside the existing `styles.css`, because tokens and the component layer are app-wide from wave 0 onward.

## Waves

### Wave 0 — tokens and the component layer

Land `@cwl/design`, import both stylesheets, change nothing else. Nothing uses them yet, so the diff is provably inert: the app renders identically, and the 80 tests pass without modification.

This is deliberately a wave of its own. If tokens and components arrive in the same commit as a rebuilt surface, a visual regression has two possible causes instead of one.

Wave 0 **authors** `clan-muster.css` rather than packaging a file that already exists: the component layer lives in `prototype/_prototype.css`, and [`components.md`](components.md) is the spec for the port — `cm-` prefixes, system and editing layers in, page layer out.

**The element-level base does not come with it.** `_prototype.css` opens with `box-sizing`, a `body` font/colour/background, `button { font: inherit }` and `:focus-visible`. Those are not component rules, and shipping them here would restyle every existing route the moment the file is imported — which is the one thing this wave promises not to do. They land with the first rebuilt surface, along with `font-variant-numeric: tabular-nums`, which the data columns want. Until then the button-shaped components carry what the global `button` rule used to give them.

Inertness is a property of the selectors, not a judgement about the screenshot: no `cm-` class appears anywhere in `apps/web`, `tokens.css` declares nothing but custom properties, and no global or element selector is added. Nothing in the layer *can* match.

**The icon sprite landed separately, after wave 0 and before wave 1.** It is `IconSprite` and `Icon` in `apps/web/src/design/icon.tsx`, mounted once in `main.tsx` and as inert as the stylesheets — nothing calls `Icon` yet. It went in its own commit for the same reason wave 0 did: wave 1 needs the star and the chevron on its first row, and inventing the sprite inside a surface rebuild would put two unrelated causes in one diff.

One cost worth naming: `tokens.css` opens with an `@import` of Archivo from Google Fonts, so importing it adds a third-party request and a font download to every load. Nothing renders in Archivo until a surface asks for `--cm-font-sans`, so this buys nothing until wave 1 — but font delivery was never settled, and self-hosting is the obvious alternative whenever someone wants it.

### Wave 1 — the members roster — **landed**

**Members goes first, not CWL.** It is a genuine surface with real data, it is not the default route, and a mistake there is cheap. That proves the migration mechanics on something recoverable before they touch the surface that must not regress.

**The element-level base lands here, inside this rebuild, and cannot be done ahead of it.** `box-sizing`, the `body` font/colour/background, `button { font: inherit }`, `:focus-visible` and `font-variant-numeric: tabular-nums` are global by nature: the moment they exist, every route changes font and colour. Landing them before a rebuilt surface would restyle `dashboard`, `overview`, `season`, `access` and the CWL workspace while each still carries its old layout CSS — five surfaces changed with no prototype to check any of them against. Inside this commit the members roster is the one surface that moves, and it has a spec to verify against.

Spec: [`prototype/members-roster.html`](prototype/members-roster.html) · [published](https://claude.ai/code/artifact/d10cff5e-b20d-4890-9bb2-4f508bec2d8e)

**The activity window reads our own logged war history, not the profile counters.** Today `member_roster_overview` carries `baseline_1d` / `baseline_7d` / `baseline_30d`, and `activityWindow()` in `member-history.ts` decides "activity observed" by diffing Clash's profile counters — donations, attack wins, Capital contributions — against our snapshot from N days ago. Wave 1 moves it to `regular_war_member_activity_window(clan_tag, window_days)` ([#34](https://github.com/nswanger/clash-of-clans/issues/34)), which reports what a member was observed doing in wars we logged.

A counter that moved tells you someone opened the game. It does not tell you they turned up for a war, and this roster is read to decide who turns up. The cost is accepted knowingly: our war history only accumulates forward from the day collection started, so early windows are thin and more members read as having no evidence yet. That is the honest answer rather than a worse one dressed up as coverage. "Building history" changes meaning with the source — it now says we have logged no war in this window, rather than that we hold no snapshot from N days ago.

The same rule settles a name collision the surface will otherwise trip on. The prototype's `warStars`, sitting beside `warAttacksMade / warAssignedAttacks`, is stars from wars we observed. It is **not** `member_roster_overview.war_stars`, which is Clash's lifetime profile counter and the one the dead-code list below drops.

#### What landed, and where it differs from the plan above

- **The base layer is `design/base.css`**, a third file in `@cwl/design` imported between the tokens and the component layer. It is design-system truth rather than members vocabulary, so it belongs beside the layer that documents its absence. The four jobs `styles.css` did against hard-coded values — `:root` font/colour/background, `* { box-sizing }`, `body { margin }`, `button { font: inherit }` — were deleted there in the same commit; two element bases arguing over the same properties is how a theme half-applies. Every route now renders in Archivo on the token background, which is the accepted cost named above.
- **The windows are 3 and 7 days, defaulting to 7, where the prototype offered 1 and 7.** Those two were what the view's hard-coded lateral joins made available; the window is a function parameter now, so the choice is real. The short window has to stay short: this is a casual clan where people go quiet suddenly, and "who stopped turning up this week" is the question it exists to answer. **Thirty days is rejected** for the reason #22 already gave — in a casual clan it mostly answers "have they quit", which `is_current_member` and `departure_observed_on` answer directly and better. One day could not survive the change of source: a regular war spans about two days, so a one-day window usually contains no war at all and would report "building history" for the whole clan. Three is the shortest window that reliably holds one — which is also the honest limit on reading it, since one logged war is the difference between "turned up for the last war" and "did not". A real signal, and a thin one; hence 7 as the default.
- **The middle status is `none`, labelled "No war activity observed".** "No change observed" named a counter that did not move, and no counter is being read any more. The three states are now: no war logged in the window (`unknown`, "Building history"), wars logged with an attack of theirs among them (`observed`), wars logged with none (`none`).
- **The evidence chips are gone; the war record is the evidence.** The prototype's panel carried both — chips from the profile counters, and a facts grid labelled "War record · all time" because `regular_war_member_history` had no date filter. With a windowed source those two say the same thing, so the panel carries one label naming the verdict and the window, and the four numbers under it. The evidence list survives for coverage caveats only: incompletely logged wars.
- **The Town Hall filter is gone**, because the prototype's filter panel carries four groups and Town Hall is not one of them; it remains a sort. That is a capability the old surface had, dropped on the prototype's authority rather than by accident.
- **Six more query fields left with the counter diff** than the dead-code list below anticipated — `trophies`, `league_id`, `attack_wins`, `defense_wins`, `clan_capital_contributions`, `clan_games_points`. They were never rendered; `activityWindow()` was their only reader, so they are dead by exactly the rule that listed the others.
- **`#/overview` keeps its old markup and five of its old rules.** It shares `members-shell`, `members-heading`, `roster-summary`, `overview-callout` and `primary-link` with the roster, and it is wave 3's — with an open question over whether it should exist at all. Only its activity count moved to the new source. The same-commit deletion rule is satisfied in the way that matters: nothing left in `styles.css` can match anything on the rebuilt roster.
- **`filter-menu.tsx` stays.** It looks like the roster's own control and its CSS sat inside the members block, but the CWL workspace renders four of them. It is wave 2's, and it carries the app's last two `textContent` glyphs — `⌄` and `✓`.
- **The shared sheet behaviour layer was not ported.** `_prototype.js` applies `is-entering` / `is-settling` and runs drag-to-dismiss by watching the DOM for overlays; in React that is an effect, not a MutationObserver, and rewriting it inside a surface rebuild is the second cause in one diff the icon sprite was split out to avoid. The sheet works without it — scrim, Escape, and the close control all dismiss — it simply does not animate or drag. Wave 2 needs it too, so it wants its own commit first.

### The sheet behaviour layer — landed between wave 1 and wave 2

`Sheet` in `apps/web/src/design/sheet.tsx`, beside the icon sprite and split out for the same reason. The members roster is its first caller; the lineup workspace is the second, which is why it lands before wave 2 rather than inside it.

The gesture is unchanged from the prototype — same dismiss fraction, same fling velocity, same sampling window, same head-only drag surface. What the port replaces is the trigger. Two of the prototype's mechanisms exist only because it had no state to read:

- **The MutationObserver becomes a mounting.** React knows when a sheet opens, so the overlay is keyed by what it shows and a new sheet is a new node. That is also what stops the entry animation replaying: the prototype compared `aria-label` against the last one it saw because `innerHTML` re-rendering made every change look like an insertion, and a keyed subtree expresses the same rule structurally.
- **The `aria-label` sniff becomes a prop.** `label` names what the sheet is showing. Callers pass the string they already give the panel's `aria-label`; it is read as identity here, not as an accessible name.

Two things the prototype did not have to decide. The entry class is stamped in a layout effect rather than a passive one, because a passive effect shows one frame of the sheet already at rest. And it is **removed** on `animationend` — the prototype leaves it on, which is harmless there but not here, since a finished animation still beats the inline transform a drag sets and the first grab after opening would do nothing.

Dismissal still hands back to the caller rather than removing anything itself, as it did in the prototype through `[data-close]`. Here it is `onClose`, called after the sheet has slid out, so a gesture that animates on the way in does not vanish on the way out.

### Wave 2 — the CWL lineup workspace — **landed**

The one with the deadline, migrated 2026-08-18 — twelve days before the 2026-08-30 season, so the "not during an active season" rule is satisfied with room rather than by a hair.

Spec: [`prototype/lineup-adjust.html`](prototype/lineup-adjust.html) · [published](https://claude.ai/code/artifact/4678e567-87c1-403a-a84c-1b7ae5f62434)

The prototype-prefixed rename landed **with** the rebuild, as the rules require, and the completeness grep is now a CI step in `deploy-pages.yml` rather than a note here.

Three things the live workspace did not have arrived with it — the swap panel, reorder mode, and the in-game checklist ([#21](https://github.com/nswanger/clash-of-clans/issues/21)). **[#36](https://github.com/nswanger/clash-of-clans/issues/36) closed before this wave started**, so the caveat this section used to carry — that the checklist might ship in page state and be lost on reload — never applied. The baseline persists server-side, and this wave is what gave `cwl_applied_lineup_baselines` its first reader.

#### What landed, and where it differs from the plan above

- **The rotation queue is gone, and that is the wave's one real capability change.** The prototype has no proposal panel: rotation need is a *ranking* term in the swap and bench lists, above CWL rating and below availability, so someone owed a turn surfaces at the moment you are choosing a replacement rather than in a queue beside the lineup. Ranking by rating alone floats the already-secured members to the top, which is backwards for bonus fairness — that inversion is the reason the term sits where it does. What leaves with the panel is preview/revert, per-change Apply, and the workspace's own read of the `recommendations` table. **The recommendation pipeline itself is untouched and still has a consumer**: the daily dashboard renders it, through its own loader. This was dropped on the prototype's authority, the same way wave 1 dropped the Town Hall filter — but it is a larger call than that one, and it is recorded here rather than buried in a diff.
- **The page prefix is `cwl-`, not `lineup-`.** `.lineup-actions` is already the dashboard's in `styles.css` — the identical collision that made the members roster take `members-` instead of the prototype's bare names. The route is `#/cwl-lineup`, so `cwl-` names the surface either way.
- **`filter-menu.tsx` is gone**, one wave after #25 predicted it would stay. The reasoning there was sound and the premise expired: it survived wave 1 because the CWL workspace rendered four of them, and the prototype replaces that four-control filter row with one search input and ranked candidates. It took the app's last two `textContent` glyphs — `⌄` and `✓` — with it, which closes [#40](https://github.com/nswanger/clash-of-clans/issues/40)'s grep for good.
- **`mapPosition` is dropped rather than used.** #25 offered both. It cannot be the in-game order the surface wants: reorder mode exists to set order *before* the war starts, and a map position only exists *after* the game has assigned one, so the field can never be present when the mode that would want it is in use. Collection still records it; nothing on this surface reads it.
- **`needsBonusTurn` lost its `observed` term.** The old predicate also required that a member not be in the observed war. The prototype asks only whether someone is owed a turn — whether they are in *this* day's observed war is a fact the row's provenance rail already carries, and folding it into the predicate made an available member with no assignments read as not needing a turn purely because a different day had started.
- **The three unprefixed selectors are gone.** `.audit-dot`, `.availability-unavailable` and `.availability-unknown` were global on every route because `cwl-lineup-workspace.css` is imported from `app-routes.tsx`. They left with the file, which is what the standing "assume it is global" warning below was waiting for.
- **The old workspace's tests were rewritten, and had to be.** They asserted on rotation-queue predicates that no longer exist. What replaced them tests the two things #21 turns on and no screenshot can show: that the checklist is `saved plan − baseline` rather than `draft − saved`, so it *appears* on Save instead of evaporating; and that a move counts once, against the plan, while a swap counts once, against the game. Every other route's tests are untouched and pass — that is the guarantee, and it held.
- **Verified in the preview against the spec**, at 1280px and 375px: the three-column desktop layout, the docked bench, the bench-as-sheet with its grabber and entry animation, a swap, a save, and a full check-off cycle through the persisted baseline.

### Wave 3 — conformance — **landed**

**Settled before this wave started, as required — see [ADR 0002](../docs/adr/0002-app-surfaces-and-cwl-phase.md).** Three of the four routes this wave was written to conform are deleted instead, so what remains is much smaller than the heading implies.

**Two design dependencies, both now closed.** The review phase is settled ([#54](https://github.com/nswanger/clash-of-clans/issues/54)) and so is the app chrome ([#58](https://github.com/nswanger/clash-of-clans/issues/58)), which was the last one open. **No design decision blocks this wave.**

One implementation dependency is not a design question and is easy to miss because nothing on the map tracks it: **`cwl_seasons.bonuses_administered_at` did not exist.** It is the review surface's only control and the resting phase's marker, and like [#34](https://github.com/nswanger/clash-of-clans/issues/34) and [#36](https://github.com/nswanger/clash-of-clans/issues/36) it is data-layer work tracked outside the map, so the frontier stays design decisions only. It is [#61](https://github.com/nswanger/clash-of-clans/issues/61) — a column and a mutation, small, but the review phase could not have landed without it.

The app collapses to three routes: **CWL**, **Members**, **Admin**. No deadline. The three surviving routes are conformed against the component inventory rather than against a prototype — by this point it should carry them, and anything that needs a new component is a finding worth recording rather than a licence to invent one. The one genuinely new surface, the review phase, does have a prototype, because a surface that exists nowhere yet cannot be conformed to anything.

| Route | Wave 3 does |
|---|---|
| `#/overview` | **Delete**, redirect to `#/members`. Four metrics under labels identical to the roster's summary strip, off the same source, plus a link to the roster. |
| `#/season` | **Delete.** The stub's blocker is real and unfixable from the current schema — only `opponent_tag` is collected, and there is no league-group standings data. |
| `#/dashboard` | **Delete.** Its roster and summary duplicate the other two routes; its recommendations and lineup history describe only the current cycle and are judged not worth a surface; its collection health moves to Admin. |
| `#/access` | **Widen into Admin** and conform. Gains collection health, which is where "is this data trustworthy" belongs beside "who can see it". Closes [#9](https://github.com/nswanger/clash-of-clans/issues/9), whose whole complaint is that normalization errors are recorded and never surfaced. |
| `#/cwl-lineup` | **Becomes `#/cwl`** and gains the phase control. It is no longer only a lineup. |

The new work in this wave is the **review phase** — bonus medals, role changes, follow-ups — which lands inside the CWL route rather than as a fourth tab, because it and the lineup workspace are complementary in time and can never both want to be on screen. ADR 0002 carries the reasoning and the phase marker.

**The review surface is designed and the wave is unblocked.** [#54](https://github.com/nswanger/clash-of-clans/issues/54) is closed: spec is [`prototype/cwl-review.html`](prototype/cwl-review.html) · [published](https://claude.ai/code/artifact/6809afd0-916a-44c5-805f-5c3aedbd0216), and it lands in the CWL route as the second phase.

It is the first surface in this migration designed rather than ported — [#20](https://github.com/nswanger/clash-of-clans/issues/20)/[#21](https://github.com/nswanger/clash-of-clans/issues/21) and [#22](https://github.com/nswanger/clash-of-clans/issues/22) prototyped pages that already existed in `apps/web` — and it needed **no new component and no ninth icon**, which is the first real test the inventory has had. The one inventory change is a promotion: the summary strip was members page layer and is used here unchanged, so it moves to the system layer. The four decisions #54 was opened to settle:

- **One ranked list, not three sections.** ADR 0001's ranking serves bonus from the top of the list and follow-up from the foot; a second section would put the same rows on the page twice, which is what `#/overview` is being deleted for. The list is grouped at the eight-star threshold, which is a rank boundary and not a bonus cutoff.
- **The bonus count is not shown, as the note below already settled.** The list ranks; the leader supplies the count.
- **One fact is recorded: whether the bonuses have been handed out.** Not who received them. Wave 3 adds `bonuses_administered_at` to `cwl_seasons` and the mutation behind it — a column, not a table, and the surface's only control. It doubles as the resting phase's explicit marker, which makes wave 4 smaller: ADR 0002's elapsed-time rule becomes the backstop for a season nobody marks rather than the whole signal. **ADR 0002 wants an amendment to say so.**
- **A previous season is reached from the topbar menu.** That also found a data gap: every CWL view routes through `cwl_current_seasons`, so an earlier season is not queryable today. **Wave 3 does not depend on it** — the review phase renders the current season — but the menu entries stay honestly disabled until a season-parameterised source exists, the same shape of change [#34](https://github.com/nswanger/clash-of-clans/issues/34) made for the roster's activity window.

> The bonus-count question that looked like it might be a collection gap is **settled and does not block**: checked against stored `raw_snapshots`, neither CWL payload carries any bonus, medal or reward field, so the count cannot be shown today. It is derivable — `/clans/{tag}` returns `warLeague`, which the collector already fetches and discards — but only with a static league-to-count table, which is game data rather than API data. The surface ranks without a hard cutoff, which ADR 0001 already implies and which stays correct either way; a count is additive later, not a restructure.

#### What landed, and where it differs from the plan above

- **The app is three routes, and `styles.css` is one rule.** `body { min-width: 320px }` is all that survives of the app's original stylesheet; the global `prefers-reduced-motion` opt-out moved to `base.css` with it, because it is design-system truth rather than app chrome. Every other block left in the same commit as the surface that carried it, which is the rule this whole migration turns on.
- **`#/access` became `#/admin`, and `#/cwl-lineup` became `#/cwl`.** Both redirect, preserving the query string, because both were linkable and one of them is named in the runbook. `#/season` and `#/dashboard` redirect nowhere in particular: they answered no question, so they fall through to the default route like any unknown path. Only `#/overview` got a named successor, and it is the roster whose numbers it duplicated.
- **The phase is resolved by the route, and each phase renders its own topbar.** `CwlRoutePage` loads two small queries — the season id and the war-day states — decides the phase, and dispatches. It could not be a field on the lineup workspace's snapshot: the decision has to be made *before* either phase fetches anything, and fetching the workspace to discover the season is over is exactly the stale-lineup defect ADR 0002 named. The phase strip is a shared component both phases render, because the eyebrow and the side controls belong to the phase, not to the route — the lineup's lock chip and day menu are not the review phase's season menu.
- **The review phase reads stars per war day from `cwl_attacks`, not `cwl_member_stars`.** The view only totals per season, and the panel's war-day record needs the per-day figure. The coverage caveat needed a second source too: a war day that never ended is absent from `cwl_completed_missed_attacks` by construction, so the only way to know a member was *in* one is to ask `cwl_war_members` for the unended tags directly.
- **The season menu lists the clan's real earlier seasons, disabled.** The prototype hard-coded two; the loader fetches every season id and hands back all but the current one. They stay disabled because the data gap is real — every CWL view routes through `cwl_current_seasons` — and listing them honestly is better than pretending the clan has no history.
- **The recommendation readers left with `#/dashboard`.** `approveRecommendation`, `overrideRecommendation` and `regenerateRecommendations` had exactly one caller between them, and ADR 0002 judged that content not worth a surface. They are dead by the same rule that took the six profile counters in wave 1. **The pipeline itself is untouched** — the table, the collector's production of it and the edge function all still run; what is gone is the app's ability to read and approve. Wave 2's note that the dashboard was the recommendation pipeline's last consumer is now spent.
- **The inventory produced two component changes, and both were bugs the surfaces found rather than gaps.** `cm-ghost` was `width: 100%` because every ghost until now lived alone in a `cm-panel-foot`; Admin put two side by side and they stacked, so the fill moved to the slot. And `cm-ghost.is-danger` is the destructive secondary, which the app's first surface with irreversible controls needed. `cm-routemenu` also turned out to have two uses rather than one — the routes and the account's sign-out — which #58 implied and did not say. All three are recorded in [`components.md`](components.md).
- **The summary strip's promotion is visible as an absence.** `members-summary` and `members-metric` are gone from the roster's page layer and the markup on that page did not change at all, which is the whole of what "promoted to the system layer" means.
- **The page-layer specificity trap caught the Admin route, exactly as wave 1 predicted.** `.admin-row` and `.cm-row` are the same specificity and the page stylesheet loads first, so `display: grid` beat `display: flex` and the control rows stacked one button per line. The fix is the standing one: give every page rule that overrides a component an ancestor.
- **The Playwright specs were already stale, and this wave says so rather than quietly rewriting them.** Five tests went with `#/dashboard`, whose surface no longer exists. Two more assert on the pre-wave-2 lineup workspace — the rotation queue, the substitute pool, the `menuitemradio` filter menus — and have been failing since wave 2 rewrote that surface without touching them. Nothing runs this suite, which is how it went unnoticed. They are marked `test.fixme` with the reason, because the behaviour is real and still wants a test, and rewriting it is a second wave's work hiding inside this one's diff.
- **The phase control had to name both phases, including the default.** The first version omitted the parameter for whichever phase the route would have chosen anyway, on the grounds that a URL should not restate state it already implies. That strands the leader in exactly the direction ADR 0002 wrote the control to prevent: once a season is over the default at bare `#/cwl` *is* review, so pressing Lineup assigned the identical hash — no `hashchange`, no re-render, and the only way back was typing the query string by hand. `hashForPhase` names the phase unconditionally now, and the test that encoded the old behaviour was itself the bug.
- **The coverage denominator is the season's seven days, not a count of `cwl_wars` rows.** A war day nobody collected leaves no row at all, so counting rows made logged equal total and the caveat went quiet on precisely the season it exists to warn about. `CWL_WAR_DAYS` is a constant because the API's `rounds` array is not collected.
- **Loading keeps a visually hidden announcement, which is a deviation from the prototype worth naming.** #43's rule is that loading has no *copy*, and the prototype's auth shell is the mark and nothing else. `aria-busy` plus one live region is what makes deleting the six visible strings cost nothing in accessibility terms, so the string is hidden rather than removed.
- **The account control grew a menu the prototype did not draw.** #58 said `cm-account` "opens sign-out" and left the shape open; it is `cm-routemenu` anchored to the trailing edge, because the topbar has exactly two things that disclose and both are app-scope. Recorded in [`components.md`](components.md) rather than invented quietly.
- **Verified in the preview against the inventory**, at 1280px and 375px: the route menu and the account control, the phase strip above the day strip, the review phase's ranked groups and container-query columns, the member sheet, the bonus-handout record, and the Admin route's collection health and control rows.

**Regular-war data gets no surface.** It is an input to the CWL and role decisions rather than a subject of its own, and the roster already covers two of its three views. The war-by-war record is drill-down about one member, so it belongs in the member detail panel if anywhere, and only once a real need appears.

The prediction this section carried — that two of the four routes might not warrant migrating — held, and undershot. Three do not. It was right about the reason: this map decided *how* a surface moves onto the system, never *which surfaces deserve to exist*, and conformance quietly assumes the page should exist in roughly its current form.

**The rule that produced the answer was "one route per question a leader actually asks."** Under it, a page whose content is a view that happens to exist is not a page. That is what caught `overview` (duplicate numbers), `season` (no data, and none coming), `dashboard` (a grab bag around one genuinely useful signal), and — prospectively — a regular-war page, which was considered and rejected on the same test before it was ever built.

### Wave 4 — the resting phase

Deferred deliberately, not left over. After review has been available for a while the CWL route should rest rather than keep presenting a finished season as though something were outstanding, and it becomes the default phase position while lineup and review stay reachable.

**The marker already exists.** ADR 0002 first set it on days since the final war's `end_time`; #54 amended that to `cwl_seasons.bonuses_administered_at`, with elapsed time surviving only as the backstop for a season nobody ever marks. Wave 3 shipped both the column and the control that writes it, so this wave inherits an observation rather than a guess about when someone lost interest. `defaultCwlPhase` in `cwl/cwl-phase.ts` is where the third position goes, and `CwlPhaseStrip` already takes the phase rather than a boolean for exactly this reason.

> **Blocked on [#55](https://github.com/nswanger/clash-of-clans/issues/55) — design the empty state.** Possibly cheaply: `cm-empty` already exists as a utility, so the first question is whether a page-scale resting state is simply that at a larger scale. If it is, #55 closes with a note and this wave is trivial.

It waits because it depends on nothing else in wave 3, and because it is the one piece here that wants a design decision rather than a port: it is an **empty state**, and [`components.md`](components.md) currently lists one under what is deliberately not a component, on the grounds that inventing it would guess ahead of a surface that needs it. This is that surface. It is not the loading pattern — skeletons assert that data is arriving, and nothing is arriving for weeks — and it is not the happy-path banner [#19](https://github.com/nswanger/clash-of-clans/issues/19) bans, provided it reads as absence rather than reassurance. See [ADR 0002](../docs/adr/0002-app-surfaces-and-cwl-phase.md).

### The app chrome — in no wave, and landed with wave 3

**The primary nav and the auth shells belonged to no wave and to no component.** Both lived in `app.tsx`:

- **`.app-shell > nav`** — five links and the display name, on a white bar with its own hover and border rules in `styles.css`. It is gone: the nav is the page's own `h1` in `cm-topbar`, and the display name is `cm-account`.
- **The three auth shells** — loading, signed-out and access-denied, all on `.access-shell`. Wave 3 lists `access`, but that was `#/access`, the access-management page. The sign-in screen was a different surface that happened to share a class, and splitting them into `auth-` and `admin-` is the collision the page prefix rule was written for.

It slipped for a legible reason rather than by oversight: the waves are organised by route, and neither of these is one. [`components.md`](components.md) has no navigation component either — its "Navigation and notice" section is the segmented strip and the notice region, which are in-page controls. **Nor is there a prototype.** Each prototype is a standalone document with a `topbar` and no app chrome at all; the only `<nav>` in either is the lineup's day strip, which is a `cm-segmented`.

~~**Waves 1 and 2 turned this from a gap into a defect.**~~ **Closed in wave 3.** The element base painted the whole app on `--cm-bg` in the reader's theme while the nav did not participate — a white bar above a dark page, on every route including the CWL workspace, from wave 1 until wave 3. There is no bar at all now.

That makes it the one piece of conformance work with a reason to move early, and the one with the least to go on. Two questions, both now settled:

- **When.** ~~Fold it into wave 3, or pull it forward before wave 2?~~ **Decided: wave 3, and landed there.** Wave 2 landed against the unmigrated bar deliberately, rather than answer "what is app-level navigation in this system" under a deadline. ADR 0002 made the job smaller than it looked — the bar carried five links and would have carried three — and #58 made it smaller again by concluding it should carry none.
- **What.** ~~There is nothing to port.~~ **Decided in [#58](https://github.com/nswanger/clash-of-clans/issues/58): the page name is the nav, and there is no app bar.** Conforming the nav meant designing one, which is exactly the case `components.md` calls "a finding worth recording rather than a licence to invent" — so it got a real decision about what app-level navigation is in this system, rather than a `cm-`-prefixed restatement of the current bar. The answer turned out to be that the system already had the bar it needed.

**The app chrome landed with wave 3, and it was designed first.** [#58](https://github.com/nswanger/clash-of-clans/issues/58) is closed: spec is [`prototype/app-chrome.html`](prototype/app-chrome.html) · [published](https://claude.ai/code/artifact/49a85991-23f3-4720-9e8e-9d13b8030a62). It is the second surface designed rather than ported, and the second real test of the inventory — which it passed differently from [#54](https://github.com/nswanger/clash-of-clans/issues/54): where the review surface needed no new component, this one needed exactly the two the inventory had already recorded as missing, and nothing else.

**There is no app bar.** The primary nav is the page's own `h1`: pressing the page name in `cm-topbar` discloses the three routes. That is what makes the chrome free — the topbar is already on every surface, so navigation adds no band of chrome to a phone-first tool, and the two rejected alternatives both failed on exactly that cost. A bottom tab set needs a slim app bar above it to carry the mark, and contends for the bottom edge `cm-actionbar` already owns on the app's default route. A top rail measurably does not fit at 375px once the mark, the product name, three links and the account control share a line — the last link clips.

The trade is real and was accepted knowingly: **navigation is behind a tap.** Three destinations, one role-conditional and one visited monthly, is not a set that needs to be on screen at all times — but a leader who has not been shown the affordance has to find it.

Three more things landed with it:

- **`cm-button`, the filled button**, which the inventory had recorded as missing since #23. The sign-in screen forced it: the only control on the only auth state that has one. The old `.primary-button` blue leaves with it, since the system has no blue accent.
- **`cm-account`**, the display name as a control. It was a bare `<span>` with no affordance, and the app had no route to sign out at all.
- **The icon set stays at eight.** `cm-routemenu` is three text rows; the label is the affordance in a menu, so route icons would have been decoration against a capped set. The bottom-tab variant would have needed all three.

> **[#24](https://github.com/nswanger/clash-of-clans/issues/24) is amended, in [`README.md`](README.md) rather than on the closed ticket.** Its placement rule read "the top bar, beside the product name", which assumed a bar that names the product; the only bar in the app names the *page*. The mark stands alone at 24px in `cm-topbar`'s first slot, and the rule that was actually load-bearing — once per screen, top bar, never on rows or as texture — is unchanged. The product name survives on the auth shell, the one surface with no page name to carry.

## Rules

**A surface migrates all at once, never rule by rule**, and its old CSS is deleted in the same commit. Collision between the two systems is impossible by construction — every Clan Muster class is `cm-`-prefixed — so the only real hazard runs the other way: an old rule still matching a *rebuilt* element because the rebuild kept an old class name. Deleting the old block in the same commit means there is never a window where both could apply.

That prefix is not hygiene. `styles.css` already defines `.eyebrow`, and so does Clan Muster's utility set.

**A page stylesheet must prefix too, and must out-specify the component layer.** Wave 1 found both the hard way. The prototypes name page classes bare — `.metric`, `.row-stats` — and `.metric` is already the dashboard's in `styles.css`, so page classes take the surface's own prefix (`members-`). And a prototype's page rules win ties by source order, because `_prototype.css` is a `<link>` above the page's `<style>`; a bundler orders by import graph instead, and a page imported from `main.tsx` lands *before* the CSS imports there. Every page-layer rule that overrides a `cm-` component therefore needs an ancestor in the selector. The one that caught it: `.members-wide-only` is also a `.cm-row-stats`, and the component's `display: flex` beat the page's `display: none`.

**The rename lands with the rebuild.** A standalone rename commit touches every line the rebuild touches anyway, and the test suite cannot catch a rename error because it never queries by class. One pass, one diff, one review.

**Do not migrate the CWL surface during an active CWL season.** This replaces a feature flag. A flag would mean shipping both stylesheets and both component trees on a static Pages deploy with no server, to guard a risk that is really about timing.

~~**Watch `cwl-lineup-workspace.css`.**~~ Settled in wave 2. The file was imported in `app-routes.tsx`, so it loaded on every route regardless of which one rendered, and three of its selectors were unprefixed: `.audit-dot`, `.availability-unavailable`, `.availability-unknown`. The rebuilt page layer is imported from the page itself and every class in it is `cwl-`-prefixed.

**Every glyph assigned through `textContent` is a latent break.** An icon is an element now, not a character ([#40](https://github.com/nswanger/clash-of-clans/issues/40)). The prototype hit this exactly once, in the action bar's disclosure; `apps/web` should be grepped for the same pattern during each wave.

## What proves a surface is correct

**Behaviour: the existing tests, unmodified.** All queries are `getByRole` or `getByText` — there is not one class-name assertion in the suite, so a restyle is invisible to it. That is the property that makes this migration safe, and it was luck rather than design, so it is worth stating plainly: *do not add class-based queries to these tests.* CI already runs `pnpm test` before build and deploy, so a behaviour regression cannot ship.

**It holds for every surface but the one being rebuilt.** Wave 1 rewrote the members tests, and had to: the prototype replaces five dropdown menus with a filter panel and the always-expanded card with a detail panel, so the tests that pressed `menuitemradio` were asserting on an interaction model that no longer exists. The unmodified-suite guarantee is about the *other* routes — the ones a restyle must not touch — and those did pass untouched. A rebuilt surface's own tests move with it, and one class assertion did leak in on the old members test (`{ selector: ".activity-status" }`); it left with the class.

**Appearance: manual comparison against the published prototypes.** No visual-regression tooling. For a six-route personal-scale app it is more machinery than the risk warrants, and the prototypes are an exact, versioned spec already.

**Completeness: one CI grep.** Landed in wave 2 as a `deploy-pages.yml` step ahead of the typecheck: it fails the build if the old prototype prefix survives anywhere in `apps/web/src`. This catches the half-finished rename, which is the one failure mode the test suite structurally cannot see — no test queries by class name, which is exactly what makes a restyle invisible to it.

The step assembles the prefix at runtime rather than writing it out, so the check does not match itself. Anything documenting the old prefix has to do the same; the page stylesheet's header comment says so where a future reader will hit it.

## Dead code to remove on the way

- **`apps/web/src/cwl-prototype/`** — empty and unreferenced since 2026-08-01. Delete it in wave 0.
- ~~**`baseline1d` / `baseline30d`, `previousClanRank`, `warStars` (the profile counter), `lastObservedPresentOn`**~~ — gone in wave 1, along with `baseline7d`, `activityWindow()`, and the six counters that turned out to have no other reader: `trophies`, `leagueId`, `attackWins`, `defenseWins`, `clanCapitalContributions`, `clanGamesPoints`. `loadMemberRoster` names its sixteen columns now instead of selecting `*`.
- ~~**`mapPosition`**~~ — gone in wave 2, dropped rather than used: reorder mode sets order before the war starts and a map position only exists after it. Collection still records it.
- ~~**The 14 status treatments in `styles.css`**~~ — gone in wave 3 with the surfaces that carried them ([#19](https://github.com/nswanger/clash-of-clans/issues/19)). What replaced them on the one surface that survived is `cm-pill` in two variants, because an access role and an invitation status are categories rather than evaluations.
- ~~**`.access-shell`, `.primary-button`, `.app-shell > nav`, `.availability-editor`, and the whole dashboard block**~~ — gone in wave 3. `styles.css` is one rule now. The `.access-shell` collision is worth naming: the sign-in screen and the access-management page shared that class while being unrelated surfaces, which is precisely what the page prefix rule exists to prevent, and wave 3 split them into `auth-` and `admin-`.
- ~~**The recommendation readers**~~ — gone in wave 3 with `#/dashboard`, their only caller. The pipeline that produces recommendations is untouched and still runs.
- ~~**`filter-menu.tsx` and its rules**~~ — gone in wave 2 with the four-control filter row the prototype replaces, taking the app's last two `textContent` glyphs.
