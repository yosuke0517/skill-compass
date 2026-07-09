import { expect, test } from "@playwright/test";

test("user can request Japanese translation for a quiz card", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Password").fill("local-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByRole("link", { name: "Today" }).click();

  await expect(page).toHaveURL(/\/today/);
  await page.getByLabel("Translate to Japanese").first().click();

  await expect(page.getByLabel("Japanese translation").first()).toBeVisible();
  await expect(page.getByText(/日本語訳|API契約|リバースプロキシ/).first()).toBeVisible();

  const unanswered = page.locator(".quiz-card").filter({ has: page.getByRole("button", { name: "Submit answer" }) }).first();
  if ((await unanswered.count()) > 0) {
    await unanswered.locator('input[name="selectedChoiceId"]').first().check();
    await unanswered.locator('textarea[name="reasoning"]').fill("I checked the translated aid and compared it with the English prompt.");
    await unanswered.getByRole("button", { name: "Submit answer" }).click();
    await expect(page.locator(".answer-feedback").first()).toBeVisible();
  }
});

test("translation keeps the current scroll position on lower cards", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Password").fill("local-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByRole("link", { name: "Today" }).click();

  const lowerCard = page.locator(".quiz-card").nth(3);
  await lowerCard.scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);
  const beforeScrollY = await page.evaluate(() => window.scrollY);
  let mainFrameNavigations = 0;
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      mainFrameNavigations += 1;
    }
  });

  await lowerCard.getByLabel("Translate to Japanese").click();
  await expect(lowerCard.getByLabel("Japanese translation")).toBeVisible();

  const afterScrollY = await page.evaluate(() => window.scrollY);
  expect(mainFrameNavigations).toBe(0);
  expect(afterScrollY).toBeGreaterThan(beforeScrollY - 120);
});
