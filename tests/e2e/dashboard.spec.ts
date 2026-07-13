import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

test("dashboard puts the next learning action before its supporting skill data", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("local@example.com");
  await page.getByLabel("Password").fill("local-password");
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  const dashboard = page.locator(".dashboard-grid");
  const continueAction = dashboard.getByRole("link", { name: "Continue to Today" });
  await expect(continueAction).toBeVisible();
  await expect(dashboard.getByRole("link").first()).toHaveAccessibleName("Continue to Today");
  await expect(dashboard.getByText("Daily quiz progress")).toBeVisible();
  await expect(page.getByText("Streak")).toBeVisible();
  await expect(page.getByText("Accuracy")).toBeVisible();

  for (const axis of ["Frontend", "Backend", "Infrastructure", "SQL", "LLM"]) {
    await expect(page.getByText(axis, { exact: true }).first()).toBeVisible();
  }

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
