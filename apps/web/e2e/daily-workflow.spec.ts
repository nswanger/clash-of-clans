import { expect, test } from "@playwright/test";

test("reviews the daily recommendation with progressive disclosure", async ({ page }) => {
  await page.goto("/#/dashboard");
  await expect(page.getByRole("heading", { name: "Daily command" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Remove these members" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Add these members" })).toBeVisible();
  await expect(page.getByText("Applied rule order", { exact: false })).toBeHidden();
  await page.getByRole("button", { name: "Why Sam?" }).click();
  await expect(page.getByText("Applied rule order", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Contact needed" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("supports accessible primary actions", async ({ page }, testInfo) => {
  await page.goto("/#/dashboard");
  const approveButton = page.getByRole("button", { name: "Approve changes" });
  await expect(approveButton).toBeVisible();
  if (testInfo.project.name === "desktop") {
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toBeVisible();
  } else {
    expect((await approveButton.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }
});

test("regenerates recommendations without recording a leader decision", async ({ page }) => {
  await page.goto("/#/dashboard");
  await page.evaluate(() => localStorage.removeItem("e2e:last-mutation"));

  await page.getByRole("button", { name: "Regenerate recommendations" }).click();

  await expect(page.getByRole("status").filter({ hasText: "Recommendations are already current." })).toBeVisible();
  const mutation = await page.evaluate(() => localStorage.getItem("e2e:last-mutation"));
  expect(mutation).toContain("function:regenerate-recommendations");
  expect(mutation).not.toContain("record_leader_decision");
});

test("uses the compact operational layout and touch targets at tablet width", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1_180 });
  await page.goto("/#/dashboard");
  await expect(page.getByRole("heading", { name: "Remove these members" })).toBeVisible();

  const metrics = page.locator(".metric");
  const [firstMetric, secondMetric, thirdMetric] = await Promise.all([
    metrics.nth(0).boundingBox(),
    metrics.nth(1).boundingBox(),
    metrics.nth(2).boundingBox(),
  ]);
  expect(firstMetric?.y).toBe(secondMetric?.y);
  expect(firstMetric?.x).not.toBe(secondMetric?.x);
  expect(thirdMetric?.y).toBeGreaterThan(firstMetric?.y ?? 0);

  const removeGroup = await page.getByRole("heading", { name: "Remove these members" }).locator("..").boundingBox();
  const addGroup = await page.getByRole("heading", { name: "Add these members" }).locator("..").boundingBox();
  expect(addGroup?.y).toBeGreaterThan(removeGroup?.y ?? 0);

  const membersLink = page.getByRole("link", { name: "Members" });
  expect((await membersLink.boundingBox())?.height).toBeGreaterThanOrEqual(44);

  await page.getByRole("link", { name: "Access" }).click();
  for (const buttonName of ["Create invitation", "Promote to admin", "Revoke access"]) {
    expect((await page.getByRole("button", { name: buttonName }).first().boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }
});

test("persists a recommendation decision through the live integration seam", async ({ page }) => {
  await page.goto("/#/dashboard");
  await page.getByRole("button", { name: "Approve changes" }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("e2e:last-mutation"))).toContain("record_leader_decision");
});

test("routes to the access workflow", async ({ page }) => {
  await page.goto("/#/dashboard");
  await page.getByRole("link", { name: "Access" }).click();
  await expect(page.getByRole("heading", { name: "Access management" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Invitation history" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent access activity" })).toBeVisible();
  await page.getByRole("button", { name: "Create invitation" }).click();
  await expect(page.getByText(/e2e-one-time-token/)).toBeVisible();
  await page.getByRole("button", { name: "Promote to admin" }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("e2e:last-mutation"))).toContain("rpc:promote_to_admin");
});

test("operates the production CWL lineup workspace through the planning seam", async ({ page }) => {
  await page.goto("/#/cwl-lineup");
  await expect(page.getByRole("heading", { name: "Lineup workspace" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /planned · drag to reorder/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Day 3" })).toHaveClass(/selected/);
  await expect(page.getByText(/Last refreshed/)).toBeVisible();

  const rotationQueue = page.getByRole("region", { name: "Rotation queue" });
  await expect(rotationQueue.getByRole("heading", { name: "Review rotation opportunities" })).toBeVisible();
  await expect(rotationQueue.getByText("Mason", { exact: true })).toBeVisible();
  await expect(rotationQueue.getByText("Sam", { exact: true })).toBeVisible();
  await expect(rotationQueue).not.toContainText("#MASON");
  await expect(page.getByRole("region", { name: "Rotation opportunity" })).toBeVisible();
  await expect(page.getByText("8★ secured", { exact: true })).toBeVisible();
  await expect(page.getByText("Needs a turn", { exact: true })).toBeVisible();

  await rotationQueue.getByRole("button", { name: "Apply rotation from Mason to Sam" }).click();
  await expect(rotationQueue.getByRole("button", { name: "Applied from Mason to Sam" })).toBeDisabled();
  await rotationQueue.getByRole("button", { name: "Revert preview" }).click();
  await expect(rotationQueue.getByRole("button", { name: "Revert preview" })).not.toBeVisible();
  await rotationQueue.getByRole("button", { name: "Preview rotation" }).click();
  await expect(rotationQueue.getByRole("button", { name: "Rotation preview applied" })).toBeDisabled();
  await rotationQueue.getByRole("button", { name: "Revert preview" }).click();

  await page.getByRole("button", { name: "Add" }).first().click();
  await page.getByRole("button", { name: "Save plan" }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("e2e:last-mutation"))).toContain("rpc:save_cwl_daily_lineup_plan");

  await page.getByRole("button", { name: "Lock day" }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("e2e:last-mutation"))).toContain("rpc:set_cwl_daily_lineup_plan_lock");
  await expect(page.getByRole("button", { name: "Unlock day" })).toBeVisible();
  expect(await page.getByRole("button", { name: "Save plan" }).isDisabled()).toBe(true);

  await page.getByRole("button", { name: /Change Kira availability/ }).click();
  await page.getByRole("menuitemradio", { name: "Available", exact: true }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("e2e:last-mutation"))).toContain("availability");
});

test("shows clan roles and lets leaders choose a stable roster sort", async ({ page }) => {
  await page.goto("/#/cwl-lineup");
  await expect(page.getByText(/Co-leader · TH14/)).toBeVisible();

  const sort = page.getByRole("button", { name: "Sort season roster" });
  await sort.click();
  await page.getByRole("menuitemradio", { name: "Role", exact: true }).click();
  await expect(sort).toContainText("Role");

  const substitutePool = page.getByRole("region", { name: "Substitute pool" });
  const lineupNameFilter = substitutePool.getByRole("textbox", { name: "Filter lineup members by name" });
  await lineupNameFilter.fill("Kira");
  await expect(substitutePool.getByText("Kira", { exact: true })).toBeVisible();
  expect(substitutePool.getByText("Sam", { exact: true })).not.toBeVisible();
  await lineupNameFilter.fill("");
  await substitutePool.getByRole("button", { name: "Filter lineup members by role" }).click();
  await page.getByRole("menuitemradio", { name: "Co-leader", exact: true }).click();
  await expect(substitutePool.getByText("Kira", { exact: true })).toBeVisible();
  expect(substitutePool.getByText("Sam", { exact: true })).not.toBeVisible();
  await substitutePool.getByRole("button", { name: "Filter lineup members by Town Hall" }).click();
  await page.getByRole("menuitemradio", { name: "TH14", exact: true }).click();
  await expect(substitutePool.getByText("Kira", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Change Kira availability/ }).click();
  await expect(page.getByRole("menu", { name: "Kira availability" })).toBeVisible();
  await expect(page.getByRole("menuitemradio", { name: "Unknown", exact: true })).toHaveAttribute("aria-checked", "true");
});

test("renders the year-round member pages with the local fixture", async ({ page }) => {
  await page.goto("/#/members");
  await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mason" })).toBeVisible();
  await page.getByRole("link", { name: "Overview" }).click();
  await expect(page.getByRole("heading", { name: "Clan overview" })).toBeVisible();
  await expect(page.getByText("Current members")).toBeVisible();
});

test("exposes and operates the primary CWL lineup route", async ({ page }) => {
  await page.goto("/#/dashboard");
  await page.getByRole("link", { name: "CWL Lineup" }).click();
  await expect(page.getByRole("heading", { name: "Lineup workspace" })).toBeVisible();

  await page.getByRole("button", { name: "Day 2" }).click();
  await page.getByRole("button", { name: "Re-inherit prior day" }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("e2e:last-mutation"))).toContain("rpc:reinherit_cwl_daily_lineup_plan");
});

test("redeems an invitation and restores a hash route without leaking the token", async ({ page }) => {
  await page.goto("/?authCallback=1&invitation=e2e-invite&returnTo=%23%2Fmembers");
  await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();
  await expect.poll(() => page.url()).not.toContain("invitation");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("e2e:last-mutation"))).toContain("redeem_invitation");
});

test("records an override with an auditable note", async ({ page }) => {
  await page.goto("/#/dashboard");
  await page.getByRole("button", { name: "Edit lineup" }).click();
  await page.getByRole("textbox", { name: "Override note" }).fill("Adjusted after clan chat");
  await page.getByRole("button", { name: "Save override" }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("e2e:last-mutation"))).toContain("overridden");
});
