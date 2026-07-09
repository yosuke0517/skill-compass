import { expect, test } from "@playwright/test";

test("dashboard shows real skill axes after login", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("local@example.com");
  await page.getByLabel("Password").fill("local-password");
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("Session active")).toBeVisible();
  await expect(page.locator(".metric-label", { hasText: "Today" })).toBeVisible();
  await expect(page.getByText("Streak")).toBeVisible();
  await expect(page.getByText("Accuracy")).toBeVisible();

  for (const axis of ["Frontend", "Backend", "Infrastructure", "SQL", "LLM"]) {
    await expect(page.getByText(axis, { exact: true }).first()).toBeVisible();
  }
});
