/* The browser workflow specs, against the app ADR 0002 left standing.
 *
 * Five tests left with `#/dashboard`: the daily recommendation, its progressive
 * disclosure, the approve and override controls, and the regenerate button.
 * ADR 0002 deleted that route on the grounds that reviewing machine
 * recommendations in detail buys nothing, so those tests describe a surface that
 * no longer exists rather than a regression to fix. The pipeline behind them is
 * untouched and is still covered by tests/e2e/cwl-acceptance.spec.ts.
 *
 * TWO TESTS BELOW ARE `test.fixme`, AND THEY WERE ALREADY FAILING BEFORE THIS
 * WAVE. They assert on the pre-wave-2 lineup workspace — the rotation queue, the
 * substitute pool, the four-control filter row and the `menuitemradio` menus —
 * all of which #25 wave 2 replaced with the swap panel, ranked candidates and a
 * single search input. Wave 2 rewrote the workspace's unit tests and did not
 * touch these, which is how they went stale; nothing runs this suite, so nothing
 * caught it. They are marked rather than deleted because the behaviour they
 * cover is real and still wants an end-to-end test, and rather than quietly
 * rewritten because that is a second wave's worth of work hiding inside this
 * one's diff.
 */
import { expect, test } from "@playwright/test";

test("opens the route menu from the page name and moves between routes", async ({ page }) => {
  await page.goto("/#/cwl");

  /* There is no nav bar and no tab bar (#58): the page's own h1 is the route
     control, and navigation is deliberately behind a tap. */
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeHidden();
  await page.getByRole("button", { name: /lineup/i }).first().click();
  await page.getByRole("link", { name: "Members" }).click();

  await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();
});

test("redirects the routes ADR 0002 renamed", async ({ page }) => {
  await page.goto("/#/cwl-lineup");
  await expect.poll(() => page.url()).toContain("#/cwl");

  await page.goto("/#/access");
  await expect.poll(() => page.url()).toContain("#/admin");

  /* Deleted for duplicating the roster's own numbers, so the roster is where a
     bookmark should land. */
  await page.goto("/#/overview");
  await expect.poll(() => page.url()).toContain("#/members");
});

test("routes to the admin workflow and keeps its touch targets", async ({ page }) => {
  await page.goto("/#/admin");
  await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();
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
  await expect.poll(() => page.evaluate(() => localStorage.getItem("e2e:last-mutation"))).toContain("rpc:promote_to_admin");
});

test("opens the CWL route on the phase the season is actually in", async ({ page }) => {
  /* The fixture season has a live war day, so the default is the lineup. The
     phase is a control rather than a hidden conditional, and it travels as a
     query parameter so a phase is linkable (ADR 0002). */
  await page.goto("/#/cwl");
  await expect(page.getByRole("navigation", { name: "CWL phase" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Lineup/ })).toHaveAttribute("aria-current", "true");

  await page.getByRole("button", { name: /^Review/ }).click();
  await expect.poll(() => page.url()).toContain("phase=review");
  await expect(page.getByRole("heading", { name: /Eight or more stars/ })).toBeVisible();
});

test("records the one fact the review phase keeps", async ({ page }) => {
  await page.goto("/#/cwl?phase=review");

  /* A status is read in the header and the action is taken from the menu that
     owns the scope — the same shape as the lineup's day lock (#54). */
  await expect(page.getByText("Bonuses administered")).toBeHidden();
  await page.getByRole("button", { name: "Season options" }).click();
  await page.getByRole("menuitem", { name: "Mark bonuses administered" }).click();

  await expect.poll(() => page.evaluate(() => localStorage.getItem("e2e:last-mutation"))).toContain("rpc:set_cwl_bonuses_administered");
  await expect(page.getByText("Bonuses administered")).toBeVisible();
});

test("states incomplete season coverage rather than averaging it away", async ({ page }) => {
  await page.goto("/#/cwl?phase=review");

  /* A war day that never ended is missing for everyone who was in it, so the
     caveat is scoped to the season rather than marked on the rows (#54). */
  await expect(page.getByText(/2 of 3 war days logged/)).toBeVisible();
});

test("renders the year-round member roster with the local fixture", async ({ page }) => {
  await page.goto("/#/members");
  await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Mason/ })).toBeVisible();
  await expect(page.getByText("Current members")).toBeVisible();
});

test("keeps the page from scrolling sideways on a phone", async ({ page }) => {
  await page.goto("/#/cwl?phase=review");
  await expect(page.getByRole("heading", { name: /Eight or more stars/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("redeems an invitation and restores a hash route without leaking the token", async ({ page }) => {
  await page.goto("/?authCallback=1&invitation=e2e-invite&returnTo=%23%2Fmembers");
  await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();
  await expect.poll(() => page.url()).not.toContain("invitation");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("e2e:last-mutation"))).toContain("redeem_invitation");
});

/* STALE SINCE WAVE 2 — see the file header. Both assert on the rotation queue,
 * the substitute pool and the `menuitemradio` filter menus, none of which exist
 * since #25 wave 2 rebuilt the workspace on Clan Muster. */
test.fixme("operates the production CWL lineup workspace through the planning seam", async ({ page }) => {
  await page.goto("/#/cwl");
  await expect(page.getByRole("heading", { name: "Lineup workspace" })).toBeVisible();

  const rotationQueue = page.getByRole("region", { name: "Rotation queue" });
  await rotationQueue.getByRole("button", { name: "Apply rotation from Mason to Sam" }).click();
  await page.getByRole("button", { name: "Save plan" }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("e2e:last-mutation"))).toContain("rpc:save_cwl_daily_lineup_plan");

  await page.getByRole("button", { name: "Lock day" }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("e2e:last-mutation"))).toContain("rpc:set_cwl_daily_lineup_plan_lock");
});

test.fixme("shows clan roles and lets leaders choose a stable roster sort", async ({ page }) => {
  await page.goto("/#/cwl");
  await expect(page.getByText(/Co-leader · TH14/)).toBeVisible();

  const sort = page.getByRole("button", { name: "Sort season roster" });
  await sort.click();
  await page.getByRole("menuitemradio", { name: "Role", exact: true }).click();
  await expect(sort).toContainText("Role");
});
