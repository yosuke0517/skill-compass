import { expect, test } from "@playwright/test";

test("user can request Japanese translation for a quiz card", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("local@example.com");
  await page.getByLabel("Password").fill("local-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByRole("link", { name: "Today" }).click();

  await expect(page).toHaveURL(/\/today/);
  const navigator = page.getByLabel("Quiz questions");
  const activeCard = navigator.locator('.quiz-card[aria-current="step"]');
  await expect(navigator.locator(".quiz-card")).toHaveCount(1);
  await expect(activeCard.getByLabel("Translate to Japanese")).toHaveCount(1);
  await activeCard.getByLabel("Translate to Japanese").click();

  const translation = activeCard.getByLabel("Japanese translation");
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

test("translation controls move with the active card", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("local@example.com");
  await page.getByLabel("Password").fill("local-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByRole("link", { name: "Today" }).click();

  const navigator = page.getByLabel("Quiz questions");
  const card = navigator.locator('.quiz-card[aria-current="step"]');
  const firstQuestionId = await card.getByRole("heading").getAttribute("id");
  await page.getByRole("button", { name: "Next question" }).click();

  await expect(card.getByRole("heading")).not.toHaveAttribute("id", firstQuestionId ?? "");
  await expect(navigator.locator(".quiz-card")).toHaveCount(1);
  await expect(card.getByLabel("Translate to Japanese")).toBeVisible();
});

test("translation keeps the current scroll position on lower cards", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("local@example.com");
  await page.getByLabel("Password").fill("local-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByRole("link", { name: "Today" }).click();

  const total = Number((await page.locator(".today-quiz-summary strong").innerText()).split("/")[1]?.trim());
  const laterCardIndex = Math.min(3, total - 1);
  test.skip(laterCardIndex < 1, "The seeded daily quiz needs more than one card for this flow.");

  for (let index = 0; index < laterCardIndex; index += 1) {
    await page.getByRole("button", { name: "Next question" }).click();
  }

  const lowerCard = page.getByLabel("Quiz questions").locator('.quiz-card[aria-current="step"]');
  await expect(lowerCard).toHaveCount(1);
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
