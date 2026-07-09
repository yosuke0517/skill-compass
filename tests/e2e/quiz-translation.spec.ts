import { expect, test } from "@playwright/test";

test("user can request Japanese translation for a quiz card", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("local@example.com");
  await page.getByLabel("Password").fill("local-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByRole("link", { name: "Today" }).click();

  await expect(page).toHaveURL(/\/today/);
  await page.getByLabel("Translate to Japanese").first().click();

  const translation = page.getByLabel("Japanese translation").first();
  await expect(translation).toBeVisible();
  await expect(translation).toContainText(/[ぁ-んァ-ン一-龯]/);

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
  await page.getByLabel("Email").fill("local@example.com");
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

test("translation shows an in-card loading state while pending", async ({ page }) => {
  await page.route("**/api/quiz/translation", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        questionId: "question_api_contract_change",
        prompt: "API変更の翻訳",
        choices: [{ id: "a", label: "選択肢" }],
        feedback: null,
        unavailable: false,
      }),
    });
  });

  await page.goto("/login");
  await page.getByLabel("Email").fill("local@example.com");
  await page.getByLabel("Password").fill("local-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByRole("link", { name: "Today" }).click();

  const card = page.locator(".quiz-card").first();
  await card.getByLabel("Translate to Japanese").click();

  await expect(card.getByLabel("Translation loading")).toBeVisible();
  await expect(card.getByLabel("Translate to Japanese")).toBeDisabled();
  await expect(card.getByLabel("Japanese translation")).toBeVisible();
});
