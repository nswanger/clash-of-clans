/* The browser workflow specs, against the app ADR 0002 left standing.
 *
 * Five tests left with `#/dashboard`: the daily recommendation, its progressive
 * disclosure, the approve and override controls, and the regenerate button.
 * ADR 0002 deleted that route on the grounds that reviewing machine
 * recommendations in detail buys nothing, so those tests describe a surface that
 * no longer exists rather than a regression to fix. The engine behind them was
 * retired in ADR 0026.
 *
 * The two workspace specs were rewritten against the wave-2 surface (#63). What
 * they cover now is the swap panel, ranked bench candidates, the single search
 * input, the bench's docked-or-sheet split, reorder mode and the in-game
 * checklist — none of which the unit tests can reach, because those test the
 * derivations and this file tests the surface they drive.
 *
 * NO QUERY HERE MAY NAME A CLASS. Every Clan Muster class is `cm-` prefixed and
 * a restyle must stay invisible to this suite (design/README.md, "The migration
 * onto this system is finished"). Rows are located by their accessible name, which for a
 * planned row begins with its position — `/^1\s*Sam/` is the lineup's first row and
 * nothing else, since bench rows carry no position.
 */
import { expect, test, type Page } from "@playwright/test";

/* The bench docks beside the lineup above 720px and arrives as a sheet below it.
 * Same panel and same accessible name either way; what differs is whether it is
 * on screen before you ask for it. */
const DOCKED_BENCH_WIDTH = 720;

/* The page's own location, not `page.url()`. Every URL these specs wait on
 * changes within one document — a redirect's `location.replace`, a phase
 * parameter, a consumed invitation token — so Playwright's frame URL updates on
 * a history event rather than a navigation, and a late or missed event leaves
 * the cached value stale for a whole poll window (#75). Asking the page reads
 * the fact itself. */
function currentUrl(page: Page) {
  return page.evaluate(() => window.location.href);
}

/* The hash alone, for the redirect test, which has to assert on the WHOLE route
   rather than on a substring of it — see the comment there. */
function currentHash(page: Page) {
  return page.evaluate(() => window.location.hash);
}

function lastMutation(page: Page) {
  return page.evaluate(() => localStorage.getItem("e2e:last-mutation"));
}

test("opens the route menu from the page name and moves between routes", async ({ page }) => {
  await page.goto("/#/cwl");

  /* There is no nav bar and no tab bar (#58): the page's own h1 is the route
     control, and navigation is deliberately behind a tap. */
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeHidden();
  await page.getByRole("button", { name: /lineup/i }).first().click();
  await page.getByRole("link", { name: "Members" }).click();

  /* The page name is an h1 and the roster's own count heading is an h2, both
     reading "Members" — the level is what separates them. */
  await expect(page.getByRole("heading", { level: 1, name: "Members" })).toBeVisible();
});

/* `reuseExistingServer: false` starts Vite fresh every run, and this spec is
 * early enough in the file to be the one that pays for a cold module graph. A
 * redirect needs a mount, an effect and a hash change on top of that, which can
 * outrun the 5s poll default on a first request and on nothing afterwards —
 * consistent with a failure that never reproduced (#75). The wait is only spent
 * when it is needed. */
const REDIRECT_TIMEOUT = { timeout: 15_000 };

/* EQUALITY, NOT `toContain`, AND THAT IS THE WHOLE OF THE #75 FLAKE.
 *
 * `"#/cwl-lineup".includes("#/cwl")` is true. So the first poll passed on the
 * PRE-redirect url, immediately, without ever waiting for the redirect it
 * exists to assert. The redirect is applied in an effect, so it was still
 * pending when the next `goto` ran — and then it landed, replacing `#/access`
 * with `#/cwl`. The second poll then waited out its timeout against a url the
 * first navigation had put there.
 *
 * That is why the failure reads "Expected #/admin, received #/cwl" rather than
 * naming `#/access` at all, and why it only ever bit on a slow runner: locally
 * the effect wins the race. #78 fixed a different cause (Playwright's cached
 * frame url) and could not fix this one. */
test("redirects the routes ADR 0002 renamed", async ({ page }) => {
  await page.goto("/#/cwl-lineup");
  await expect.poll(() => currentHash(page), REDIRECT_TIMEOUT).toBe("#/cwl");

  await page.goto("/#/access");
  await expect.poll(() => currentHash(page), REDIRECT_TIMEOUT).toBe("#/admin");

  /* Deleted for duplicating the roster's own numbers, so the roster is where a
     bookmark should land. */
  await page.goto("/#/overview");
  await expect.poll(() => currentHash(page), REDIRECT_TIMEOUT).toBe("#/members");
});

test("routes to the admin workflow and keeps its touch targets", async ({ page }) => {
  await page.goto("/#/admin");
  await expect(page.getByRole("heading", { level: 1, name: "Admin" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Invitation history/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Recent access activity/ })).toBeVisible();
  /* Collection health moved here from the deleted dashboard, which is where "is
     this data trustworthy" belongs beside "who can see it" (ADR 0002, #9). */
  await expect(page.getByRole("heading", { name: "Collection health" })).toBeVisible();

  for (const buttonName of ["Create invitation", "Promote to admin", "Revoke access"]) {
    expect((await page.getByRole("button", { name: buttonName }).first().boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }

  await page.getByRole("button", { name: "Create invitation" }).click();
  await expect(page.getByText(/e2e-one-time-token/)).toBeVisible();
  await page.getByRole("button", { name: "Promote to admin" }).click();
  await expect.poll(() => lastMutation(page)).toContain("rpc:promote_to_admin");
});

test("opens the CWL route on the phase the season is actually in", async ({ page }) => {
  /* The fixture season has a live war day, so the default is the lineup. The
     phase is a control rather than a hidden conditional, and it travels as a
     query parameter so a phase is linkable (ADR 0002). */
  await page.goto("/#/cwl");
  await expect(page.getByRole("navigation", { name: "CWL phase" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Lineup/ })).toHaveAttribute("aria-current", "true");

  await page.getByRole("button", { name: /^Review/ }).click();
  await expect.poll(() => currentUrl(page)).toContain("phase=review");
  /* NOT "Eight or more stars", which cannot render against this fixture and is
     why this assertion was failing: CWL allows one attack per member per war, so
     two logged war days cap a member at six stars and the secured group is
     correctly empty. A group with no entries renders nothing at all (#54), so
     the honest assertion is the group that does exist mid-season. */
  await expect(page.getByRole("heading", { name: /Below eight stars/ })).toBeVisible();
});

/* The third phase gets browser coverage where the other two have it, because it
   is the one surface whose body is a live clock: the dispatch, the countdown and
   the strip's sub-label all have to agree on one screen, and a unit test can
   only assert two of them against a fake clock. */
test("stands down on the third phase, with the clock and the strip agreeing", async ({ page }) => {
  await page.goto("/#/cwl?phase=resting");

  await expect(page.getByRole("heading", { level: 1, name: "Stand down" })).toBeVisible();
  await expect(page.getByText(/is finished\./)).toBeVisible();
  await expect(page.getByText("Next CWL starts in")).toBeVisible();

  /* The drop form at full granularity, and the strip's sub-label floored to the
     same day the clock shows — the prototype's own bug was "10 days" above a
     clock reading "9d". */
  const clock = page.getByRole("timer");
  await expect(clock).toHaveText(/^(\d+d )?\d{2}:\d{2}:\d{2}$/);
  const days = (await clock.innerText()).match(/^(\d+)d/)?.[1];
  const standDown = page.getByRole("button", { name: /^Stand down/ });
  await expect(standDown).toHaveAttribute("aria-current", "true");
  if (days) await expect(standDown).toContainText(days === "1" ? "a day" : `${days} days`);

  /* Reopen review is the live control and the way back. */
  await page.getByRole("button", { name: "Season options" }).click();
  await page.getByRole("menuitem", { name: "Reopen review" }).click();
  await expect.poll(() => lastMutation(page)).toContain("rpc:set_cwl_bonuses_administered");
  await expect(page.getByRole("heading", { level: 1, name: "Review" })).toBeVisible();
});

/* THE PRE-SEASON ROLL CALL (#96).
 *
 * The availability message goes out in the last days of the month, days before
 * the season it is about exists. Stand down is where the leader is on those
 * days, and until this it was the one surface in the app with nothing to do on
 * it. */
test("records who said yes before the season the answers are about exists", async ({ page }) => {
  await page.goto("/#/cwl?phase=resting");

  /* ONE COMPONENT, TWO MOUNTINGS, and this test walks whichever one the project
     is running: docked into the page above 720px, a sheet behind a button below
     it. The month comes from the same arithmetic as the clock, so the control
     and the countdown can never name different seasons. */
  const docked = (page.viewportSize()?.width ?? 0) >= 720;
  if (!docked) {
    /* The count line stays off a quiet page until there is something to
       report -- "0 of 3 said yes" is true and reads as a failing grade. */
    await expect(page.getByText(/said yes/)).toBeHidden();
    /* `click` waits for the control, where counting it would race the load. */
    await page.getByRole("button", { name: /^Roll call for / }).click();
  }

  const panel = page.getByLabel("Roll call");
  await expect(panel).toBeVisible();
  /* Silence is not an answer (AGENTS.md: absence of evidence is never a
     penalty), so the surface has to say what an untouched roster means. */
  await expect(page.getByText(/stays unknown, not unavailable/)).toBeVisible();

  /* The list is the ANSWERS, not the roster: nobody has replied yet, so there is
     nothing to show and the search is the way in. */
  await expect(page.getByText("No answers yet. Search to add whoever liked the message.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Mason/ })).toBeHidden();

  await page.getByRole("searchbox", { name: "Find a member" }).fill("mas");
  const mason = page.getByRole("button", { name: /Mason/ });
  await expect(mason).toHaveAttribute("aria-pressed", "false");
  await mason.click();
  await expect.poll(() => lastMutation(page)).toContain("roll-call");
  await expect(mason).toHaveAttribute("aria-pressed", "true");

  /* Cleared, the answer stands on its own without a query behind it. */
  await page.getByRole("searchbox", { name: "Find a member" }).fill("");
  await expect(page.getByRole("button", { name: /Mason/, exact: false })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/1 of 3 said yes/).first()).toBeVisible();

  /* An untick removes the entry rather than storing a no: the message only
     collects likes, so a recorded no would be an answer nobody gave -- and the
     member leaves the list, because the list is the answers. */
  await page.getByRole("button", { name: /Mason/ }).click();
  await expect(page.getByText("No answers yet. Search to add whoever liked the message.")).toBeVisible();
});

test("records the one fact the review phase keeps", async ({ page }) => {
  await page.goto("/#/cwl?phase=review");

  /* A status is read in the header and the action is taken from the menu that
     owns the scope — the same shape as the lineup's day lock (#54). */
  await expect(page.getByText("Bonuses administered")).toBeHidden();
  await page.getByRole("button", { name: "Season options" }).click();
  await page.getByRole("menuitem", { name: "Mark bonuses administered" }).click();

  await expect.poll(() => lastMutation(page)).toContain("rpc:set_cwl_bonuses_administered");
  await expect(page.getByText("Bonuses administered")).toBeVisible();
});

test("states incomplete season coverage rather than averaging it away", async ({ page }) => {
  await page.goto("/#/cwl?phase=review");

  /* A war day that never ended is missing for everyone who was in it, so the
     caveat is scoped to the season rather than marked on the rows (#54). */
  await expect(page.getByText(/2 of 7 war days logged/)).toBeVisible();
});

/* #56. The season menu's earlier entries were disabled from #54 until now,
   because a previous season was collected and not queryable. This is the whole
   claim they were disabled for: the menu reaches the season, the URL carries it,
   and the figures on screen are that season's rather than the current one's.

   The fixture's two seasons differ deliberately — the current one has two of
   seven war days logged and Kira on no lineup, the previous one is complete and
   is Kira's. Asserting on the coverage line is therefore an assertion about
   which season rendered, not about a heading that both would show. */
test("reaches a previous season's review from the season menu", async ({ page }) => {
  await page.goto("/#/cwl?phase=review");
  await expect(page.getByText(/2 of 7 war days logged/)).toBeVisible();

  await page.getByRole("button", { name: "Season options" }).click();
  /* The entries READ AS MONTHS while the route carries the id, so the label no
     longer spells the season the click will request. The entry for the season
     already on screen carries a "Current" suffix; a bare month is an earlier
     season, and the id it resolves to is asserted on the url rather than
     derived from the text. */
  const seasons = await page.getByRole("menuitem").allInnerTexts();
  const previous = seasons.find((entry) => /^[A-Z][a-z]+ \d{4}$/.test(entry.trim()));
  expect(previous).toBeTruthy();
  await page.getByRole("menuitem", { name: previous!.trim() }).click();

  await expect.poll(() => currentUrl(page)).toMatch(/season=\d{4}-\d{2}-\d{2}/);
  await expect.poll(() => currentUrl(page)).toContain("phase=review");
  /* The eyebrow says which season this is, because a month name alone gives a
     leader no way to tell a finished record from the live one. */
  await expect(page.getByText(/Previous season/)).toBeVisible();
  /* Complete coverage, so the caveat is silent — the current season's is not. */
  await expect(page.getByText(/war days logged/)).toBeHidden();
  /* Kira cleared eight stars over the previous season's seven days, so the
     secured group renders — which the current season's two war days cannot
     produce at one attack per member per war. */
  await expect(page.getByRole("heading", { name: /Eight or more stars/ })).toBeVisible();

  /* Leaving review drops the season: the lineup is the war being fought, not
     the month you were reading about. */
  await page.getByRole("button", { name: /^Lineup/ }).click();
  await expect.poll(() => currentUrl(page)).not.toContain("season=");
});

test("renders the year-round member roster with the local fixture", async ({ page }) => {
  await page.goto("/#/members");
  await expect(page.getByRole("heading", { level: 1, name: "Members" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Mason/ })).toBeVisible();
  await expect(page.getByText("Current members")).toBeVisible();
});

test("keeps the page from scrolling sideways on a phone", async ({ page }) => {
  await page.goto("/#/cwl?phase=review");
  await expect(page.getByRole("heading", { name: /Below eight stars/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("redeems an invitation and restores a hash route without leaking the token", async ({ page }) => {
  await page.goto("/?authCallback=1&invitation=e2e-invite&returnTo=%23%2Fmembers");
  await expect(page.getByRole("heading", { level: 1, name: "Members" })).toBeVisible();
  await expect.poll(() => currentUrl(page)).not.toContain("invitation");
  await expect.poll(() => lastMutation(page)).toContain("redeem_invitation");
});

/* Rewritten from the pre-wave-2 spec of the same name (#63). What it used to
 * drive — the rotation queue's per-change Apply — is gone: rotation need is a
 * ranking term in the swap and bench lists now rather than a panel, so the
 * replacement walks the seam the way a leader does. */
test("operates the CWL lineup workspace through the planning seam", async ({ page }) => {
  await page.goto("/#/cwl");
  await expect(page.getByRole("heading", { level: 1, name: "Day 3 lineup" })).toBeVisible();

  /* Two independent controls, and the checklist is quiet before a save because
     the plan and the game agree. */
  await expect(page.getByRole("button", { name: "Nothing to make in game" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Saved", exact: true })).toBeDisabled();

  await page.getByRole("button", { name: /Mason/ }).click();
  const swap = page.getByRole("dialog", { name: "Mason" });
  /* The role survives wave 2 in the panel's evidence line; it was the deleted
     roster sort that carried it before. Elder is the final tie-breaker among
     otherwise comparable candidates, so it has to be legible here. */
  await expect(swap.getByText(/Elder/)).toBeVisible();
  await expect(swap.getByText("Replace with")).toBeVisible();
  await swap.getByRole("button", { name: /Sam/ }).click();

  await expect(page.getByRole("button", { name: /^1\s*Sam/ })).toBeVisible();
  await page.getByRole("button", { name: "Save 1" }).click();
  await expect.poll(() => lastMutation(page)).toContain("rpc:save_cwl_daily_lineup_plan");

  /* THE ONE INVARIANT NO SCREENSHOT CAN SHOW (#21). The checklist is
     `saved plan − baseline`, not `draft − saved`, so saving is what makes it
     APPEAR — the moment you switch to Clash — rather than what empties it. */
  const checklist = page.getByRole("button", { name: "1 to make in game" });
  await expect(checklist).toBeVisible();
  await checklist.click();

  const inGame = page.getByRole("dialog", { name: "In game" });
  await inGame.getByRole("button", { name: /Mason\s*Sam/ }).click();
  await expect.poll(() => lastMutation(page)).toContain("rpc:record_cwl_applied_lineup_change");
  await expect(page.getByRole("button", { name: "All 1 made in game" })).toBeVisible();

  /* A half-applied change set is a fact about the clan's war rather than about
     one device (#36), and the reload is the whole reason it is stored server
     side: a checklist that reset here would instruct a leader to redo swaps they
     had already made in game. */
  await page.reload();
  await expect(page.getByRole("button", { name: "All 1 made in game" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^1\s*Sam/ })).toBeVisible();
});

test("locks a war day against lineup edits", async ({ page }) => {
  await page.goto("/#/cwl");
  await expect(page.getByText("Unlocked", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Day options" }).click();
  await page.getByRole("menuitem", { name: "Lock day" }).click();
  await expect.poll(() => lastMutation(page)).toContain("rpc:set_cwl_daily_lineup_plan_lock");

  /* The lock guards membership and ordering while leaving availability and the
     observed evidence alone, so reorder is the control that must go dead. */
  await expect(page.getByText("Locked", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reorder lineup" })).toBeDisabled();
});

/* Replaces "shows clan roles and lets leaders choose a stable roster sort".
 * HALF OF THAT TEST DESCRIBES A DELETED SURFACE: the roster sort menu was
 * `filter-menu.tsx`, which left in wave 2 when the four-control filter row
 * became one search input, so it is gone for the same reason the `#/dashboard`
 * specs are. The role half moved into the swap panel above, where the role is
 * now shown. What is left worth covering is what replaced it. */
test("offers ranked bench candidates and reorders the lineup to match the game", async ({ page }) => {
  await page.goto("/#/cwl");
  const wide = (page.viewportSize()?.width ?? 0) >= DOCKED_BENCH_WIDTH;
  const bench = page.getByRole("dialog", { name: "Bench" });

  if (wide) {
    /* The bench is the column's default occupant, so it is already on screen. */
    await expect(bench).toBeVisible();
  } else {
    await expect(bench).toBeHidden();
    await page.getByRole("button", { name: /^Bench 2/ }).click();
    await expect(bench).toBeVisible();
  }

  /* Ranked by rotation need above CWL rating, which is what stops the members
     who have already secured a bonus floating to the top of a list you read to
     choose a replacement. */
  const candidates = bench.getByRole("button", { name: /TH\d+/ });
  await expect(candidates.first()).toContainText("Needs a turn");

  const search = bench.getByRole("searchbox", { name: "Find a member" });
  await search.fill("Kira");
  await expect(candidates).toHaveCount(1);
  await expect(candidates.first()).toContainText("Kira");
  await search.fill("nobody");
  await expect(bench.getByText(/No one matches/)).toBeVisible();
  await search.fill("");

  /* Adding from the bench appends rather than swapping, because no planned row
     was named. */
  await bench.getByRole("button", { name: /Sam/ }).click();
  await expect(page.getByRole("button", { name: /^2\s*Sam/ })).toBeVisible();

  /* THE BENCH STAYS OPEN AFTER AN ADD, deliberately — a short lineup is filled
     several at a time, and only a swap names a row and so closes on choosing.
     Below 720px that leaves a sheet with a scrim over the page, so dismissing it
     is part of the flow rather than test housekeeping. */
  if (!wide) {
    await bench.getByRole("button", { name: "Close" }).click();
    await expect(bench).toBeHidden();
  }

  /* Reorder is its own mode: matching the game is a bulk task, so rows collapse
     to number, name and handle instead of gaining a per-row affordance. */
  await page.getByRole("button", { name: "Reorder lineup" }).click();
  await expect(page.getByRole("button", { name: "Done" })).toBeVisible();

  const handle = page.getByLabel("Reorder Sam");
  const from = await handle.boundingBox();
  const target = await page.getByLabel("Reorder Mason").boundingBox();
  if (!from || !target) throw new Error("The reorder handles are not on screen");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  /* Stepped, because the drop index is resolved from pointer moves and a frame
     loop rather than from a single jump. */
  await page.mouse.move(target.x + target.width / 2, target.y - from.height, { steps: 12 });
  await page.mouse.up();

  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("button", { name: /^1\s*Sam/ })).toBeVisible();
});
