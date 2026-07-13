import { expect, test } from "@playwright/test";

test("reviews the daily recommendation with progressive disclosure", async ({ page }) => {
  await page.goto("/");
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
  await page.goto("/");
  const approveButton = page.getByRole("button", { name: "Approve changes" });
  await expect(approveButton).toBeVisible();
  if (testInfo.project.name === "desktop") {
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toBeVisible();
  } else {
    expect((await approveButton.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }
});

test("persists a recommendation decision through the live integration seam", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Approve changes" }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("e2e:last-mutation"))).toContain("record_leader_decision");
});

test("routes to availability and access workflows", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Availability" }).click();
  await expect(page.getByRole("heading", { name: "Availability" })).toBeVisible();
  await page.getByRole("radio", { name: "Unavailable" }).first().check();
  await page.getByRole("button", { name: "Save availability" }).first().click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("e2e:last-mutation"))).toContain("availability");

  await page.getByRole("link", { name: "Access" }).click();
  await expect(page.getByRole("heading", { name: "Access management" })).toBeVisible();
  await page.getByRole("button", { name: "Create invitation" }).click();
  await expect(page.getByText(/e2e-one-time-token/)).toBeVisible();
  await page.getByRole("button", { name: "Promote to admin" }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("e2e:last-mutation"))).toContain("insert:user_roles");
});

test("redeems an invitation and restores a hash route without leaking the token", async ({ page }) => {
  await page.goto("/?authCallback=1&invitation=e2e-invite&returnTo=%23%2Favailability");
  await expect(page.getByRole("heading", { name: "Availability" })).toBeVisible();
  await expect.poll(() => page.url()).not.toContain("invitation");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("e2e:last-mutation"))).toContain("redeem_invitation");
});

test("records an override with an auditable note", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Edit lineup" }).click();
  await page.getByRole("textbox", { name: "Override note" }).fill("Adjusted after clan chat");
  await page.getByRole("button", { name: "Save override" }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("e2e:last-mutation"))).toContain("overridden");
});
