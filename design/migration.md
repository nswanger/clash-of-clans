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

**The icon sprite still has no route into the app.** The eight symbols live in `prototype/_prototype.js` as a string injected at runtime; wave 0 imports CSS only. Wave 1 needs the star and the chevron on its first row, so the sprite ships with it — as markup in `index.html` or a React component, which is a build decision rather than a design one.

One cost worth naming: `tokens.css` opens with an `@import` of Archivo from Google Fonts, so importing it adds a third-party request and a font download to every load. Nothing renders in Archivo until a surface asks for `--cm-font-sans`, so this buys nothing until wave 1 — but font delivery was never settled, and self-hosting is the obvious alternative whenever someone wants it.

### Wave 1 — the members roster

**Members goes first, not CWL.** It is a genuine surface with real data, it is not the default route, and a mistake there is cheap. That proves the migration mechanics on something recoverable before they touch the surface that must not regress.

Spec: [`prototype/members-roster.html`](prototype/members-roster.html) · [published](https://claude.ai/code/artifact/d10cff5e-b20d-4890-9bb2-4f508bec2d8e)

**The activity window reads our own logged war history, not the profile counters.** Today `member_roster_overview` carries `baseline_1d` / `baseline_7d` / `baseline_30d`, and `activityWindow()` in `member-history.ts` decides "activity observed" by diffing Clash's profile counters — donations, attack wins, Capital contributions — against our snapshot from N days ago. Wave 1 moves it to `regular_war_member_activity_window(clan_tag, window_days)` ([#34](https://github.com/nswanger/clash-of-clans/issues/34)), which reports what a member was observed doing in wars we logged.

A counter that moved tells you someone opened the game. It does not tell you they turned up for a war, and this roster is read to decide who turns up. The cost is accepted knowingly: our war history only accumulates forward from the day collection started, so early windows are thin and more members read as having no evidence yet. That is the honest answer rather than a worse one dressed up as coverage. "Building history" changes meaning with the source — it now says we have logged no war in this window, rather than that we hold no snapshot from N days ago.

The same rule settles a name collision the surface will otherwise trip on. The prototype's `warStars`, sitting beside `warAttacksMade / warAssignedAttacks`, is stars from wars we observed. It is **not** `member_roster_overview.war_stars`, which is Clash's lifetime profile counter and the one the dead-code list below drops.

### Wave 2 — the CWL lineup workspace

The one with the deadline. Spec: [`prototype/lineup-adjust.html`](prototype/lineup-adjust.html) · [published](https://claude.ai/code/artifact/4678e567-87c1-403a-a84c-1b7ae5f62434)

The `cwl-proto-*` rename lands **with** this rebuild, never as its own commit — see the rules below.

Note that the prototype covers behaviour the live workspace does not have yet: the swap panel, reorder mode, and the in-game checklist ([#21](https://github.com/nswanger/clash-of-clans/issues/21)). The checklist needs [#36](https://github.com/nswanger/clash-of-clans/issues/36) to persist its baseline; without it the surface can still ship, with the checklist held in page state and lost on reload. That is a decision for the build, not for this map.

### Wave 3 — conformance

The remaining routes — `overview`, `season`, `dashboard`, `access` — brought onto the system. No deadline, and no prototype: by this point the component inventory should carry them, and anything that needs a new component is a finding worth recording rather than a licence to invent one.

**Two of the four may not warrant migrating at all, and that question is not answered here.** This map decided *how* a surface moves onto the system, never *which surfaces deserve to exist* — page rebuilds are explicitly out of its scope. Conformance assumes the page should exist in roughly its current form, and for two routes that assumption does not hold:

- **`overview`** is four summary metrics plus a callout linking to `#/members`. The members roster designed in [#22](https://github.com/nswanger/clash-of-clans/issues/22) carries a summary strip with the *same four metrics* — current members, activity observed over 7 days, building history, former members. Conforming it as-is would ship two pages showing identical numbers, one of which exists only to link to the other. The likely answer is deletion with `#/overview` redirecting to `#/members`, but that is a product call.
- **`season`** is an inline stub in `app-routes.tsx`: a heading and one sentence saying verified group standings are not available in the normalized data yet. There is nothing to conform.

`dashboard` and `access` are real surfaces and conform normally.

**Settle this before starting wave 3**, in its own session. Deciding what the app should contain is a different question from deciding what it should look like, and answering it inside a styling wave is how a restyle silently becomes a redesign.

## Rules

**A surface migrates all at once, never rule by rule**, and its old CSS is deleted in the same commit. Collision between the two systems is impossible by construction — every Clan Muster class is `cm-`-prefixed — so the only real hazard runs the other way: an old rule still matching a *rebuilt* element because the rebuild kept an old class name. Deleting the old block in the same commit means there is never a window where both could apply.

That prefix is not hygiene. `styles.css` already defines `.eyebrow`, and so does Clan Muster's utility set.

**The rename lands with the rebuild.** A standalone rename commit touches every line the rebuild touches anyway, and the test suite cannot catch a rename error because it never queries by class. One pass, one diff, one review.

**Do not migrate the CWL surface during an active CWL season.** This replaces a feature flag. A flag would mean shipping both stylesheets and both component trees on a static Pages deploy with no server, to guard a risk that is really about timing.

**Watch `cwl-lineup-workspace.css`.** It is imported in `app-routes.tsx`, so it loads on every route regardless of which one renders, and three of its selectors are unprefixed: `.audit-dot`, `.availability-unavailable`, `.availability-unknown`. It disappears in wave 2; until then, assume it is global.

**Every glyph assigned through `textContent` is a latent break.** An icon is an element now, not a character ([#40](https://github.com/nswanger/clash-of-clans/issues/40)). The prototype hit this exactly once, in the action bar's disclosure; `apps/web` should be grepped for the same pattern during each wave.

## What proves a surface is correct

**Behaviour: the existing 80 tests, unmodified.** All 137 queries are `getByRole` or `getByText` — there is not one class-name assertion in the suite, so a restyle is invisible to it. That is the property that makes this migration safe, and it was luck rather than design, so it is worth stating plainly: *do not add class-based queries to these tests.* CI already runs `pnpm test` before build and deploy, so a behaviour regression cannot ship.

**Appearance: manual comparison against the published prototypes.** No visual-regression tooling. For a six-route personal-scale app it is more machinery than the risk warrants, and the prototypes are an exact, versioned spec already.

**Completeness: one CI grep.** Assert that no `cwl-proto-` string survives once wave 2 lands. This catches the half-finished rename, which is the one failure mode the test suite structurally cannot see.

## Dead code to remove on the way

- **`apps/web/src/cwl-prototype/`** — empty and unreferenced since 2026-08-01. Delete it in wave 0.
- **`baseline1d` / `baseline30d`, `previousClanRank`, `warStars` (the profile counter), `lastObservedPresentOn`** — fetched on every members load and never rendered ([#22](https://github.com/nswanger/clash-of-clans/issues/22)). Drop from the query in wave 1. `baseline7d` joins them once the activity window moves to logged war history, and `activityWindow()` in `member-history.ts` leaves with it — `members-page.tsx` is its only caller.
- **`mapPosition`** — fetched and discarded by the CWL workspace, which reads `observed` only as a boolean set ([#21](https://github.com/nswanger/clash-of-clans/issues/21)). Wave 2 should either use it as the in-game order or stop selecting it.
- **The 14 status treatments in `styles.css`** — reduced to two that can ever fire ([#19](https://github.com/nswanger/clash-of-clans/issues/19)). They leave with the surfaces that carry them.
