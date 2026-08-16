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

### Wave 1 — the members roster

**Members goes first, not CWL.** It is a genuine surface with real data, it is not the default route, and a mistake there is cheap. That proves the migration mechanics on something recoverable before they touch the surface that must not regress.

Spec: [`prototype/members-roster.html`](prototype/members-roster.html) · [published](https://claude.ai/code/artifact/d10cff5e-b20d-4890-9bb2-4f508bec2d8e)

### Wave 2 — the CWL lineup workspace

The one with the deadline. Spec: [`prototype/lineup-adjust.html`](prototype/lineup-adjust.html) · [published](https://claude.ai/code/artifact/4678e567-87c1-403a-a84c-1b7ae5f62434)

The `cwl-proto-*` rename lands **with** this rebuild, never as its own commit — see the rules below.

Note that the prototype covers behaviour the live workspace does not have yet: the swap panel, reorder mode, and the in-game checklist ([#21](https://github.com/nswanger/clash-of-clans/issues/21)). The checklist needs [#36](https://github.com/nswanger/clash-of-clans/issues/36) to persist its baseline; without it the surface can still ship, with the checklist held in page state and lost on reload. That is a decision for the build, not for this map.

### Wave 3 — conformance

The four remaining routes — `overview`, `season`, `dashboard`, `access` — brought onto the system. No deadline, and no prototype: by this point the component inventory should carry them, and anything that needs a new component is a finding worth recording rather than a licence to invent one.

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
- **`baseline1d` / `baseline30d`, `previousClanRank`, `warStars`, `lastObservedPresentOn`** — fetched on every members load and never rendered ([#22](https://github.com/nswanger/clash-of-clans/issues/22)). Drop from the query in wave 1.
- **`mapPosition`** — fetched and discarded by the CWL workspace, which reads `observed` only as a boolean set ([#21](https://github.com/nswanger/clash-of-clans/issues/21)). Wave 2 should either use it as the in-game order or stop selecting it.
- **The 14 status treatments in `styles.css`** — reduced to two that can ever fire ([#19](https://github.com/nswanger/clash-of-clans/issues/19)). They leave with the surfaces that carry them.
