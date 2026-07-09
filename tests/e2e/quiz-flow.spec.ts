import { expect, test } from "@playwright/test";

test("user can answer a daily quiz question", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Password").fill("local-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByRole("link", { name: "Today" }).click();

  await expect(page).toHaveURL(/\/today/);
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();

  const firstUnanswered = page.locator(".quiz-card").filter({ has: page.getByRole("button", { name: "Submit answer" }) }).first();
  const unansweredCount = await firstUnanswered.count();

  if (unansweredCount > 0) {
    await firstUnanswered.locator('input[name="selectedChoiceId"]').first().check();
    await firstUnanswered.locator('input[name="confidence"][value="4"]').check();
    await firstUnanswered.locator('textarea[name="reasoning"]').fill("I compared the available choices with the source.");
    await firstUnanswered.getByRole("button", { name: "Submit answer" }).click();
  }

  await expect(page.locator(".answer-feedback").first()).toBeVisible();
});
