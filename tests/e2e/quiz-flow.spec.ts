import { expect, test } from "@playwright/test";

test("today shows one quiz card with navigation controls", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("local@example.com");
  await page.getByLabel("Password").fill("local-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByRole("link", { name: "Today" }).click();

  const cards = page.locator(".quiz-card");
  await expect(cards).toHaveCount(1);

  const total = Number((await page.locator(".today-quiz-summary strong").innerText()).split("/")[1]?.trim());
  await expect(page.getByText(`1 / ${total}`, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Previous question" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next question" })).toBeVisible();
});

test("user can answer a daily quiz question", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("local@example.com");
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
    await firstUnanswered.getByRole("button", { name: "Submit answer" }).click();
  }

  await expect(page.locator(".answer-feedback").first()).toBeVisible();
  const answeredCard = page.locator(".quiz-card.answered").first();
  await expect(answeredCard.getByLabel("Answer review")).toBeVisible();
  await expect(answeredCard.locator(".answer-review-summary").filter({ hasText: "Your answer" })).toBeVisible();
  await expect(answeredCard.locator(".answer-review-summary").filter({ hasText: "Correct answer" })).toBeVisible();
  await expect(answeredCard.locator(".answer-badge.selected")).toBeVisible();
  await expect(answeredCard.locator(".answer-badge.correct")).toBeVisible();
});

test("user can add more questions after completing the current set", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("local@example.com");
  await page.getByLabel("Password").fill("local-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByRole("link", { name: "Today" }).click();

  const total = Number((await page.locator(".today-quiz-summary strong").innerText()).split("/")[1]?.trim());

  for (let questionIndex = 0; questionIndex < total; questionIndex += 1) {
    const addButton = page.getByRole("button", { name: "Add 5" });
    if ((await addButton.count()) > 0) break;

    for (let index = 0; index < questionIndex; index += 1) {
      await page.getByRole("button", { name: "Next question" }).click();
    }

    const unanswered = page.locator(".quiz-card").filter({ has: page.getByRole("button", { name: "Submit answer" }) });
    if ((await unanswered.count()) === 0) continue;

    await unanswered.locator('input[name="selectedChoiceId"]').first().check();
    await unanswered.locator('textarea[name="reasoning"]').fill("I am finishing the current set before adding more practice.");
    await unanswered.getByRole("button", { name: "Submit answer" }).click();
    await expect(page).toHaveURL(/\/today/);
  }

  const beforeText = await page.locator(".today-quiz-summary strong").innerText();
  const beforeTotal = Number(beforeText.split("/")[1]?.trim());
  const addButton = page.getByRole("button", { name: "Add 5" });

  if ((await addButton.count()) === 0) {
    const unansweredCount = await page.locator(".quiz-card").filter({ has: page.getByRole("button", { name: "Submit answer" }) }).count();
    expect(beforeTotal >= 30 || unansweredCount > 0).toBe(true);
    return;
  }

  expect(await addButton.evaluate((element) => getComputedStyle(element).position)).toBe("sticky");
  await addButton.click();
  await expect
    .poll(async () => {
      const afterText = await page.locator(".today-quiz-summary strong").innerText();
      return Number(afterText.split("/")[1]?.trim());
    })
    .toBeGreaterThan(beforeTotal);
});
