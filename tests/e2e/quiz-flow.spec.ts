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

test("user can add more questions after completing the current set", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Password").fill("local-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByRole("link", { name: "Today" }).click();

  for (let index = 0; index < 8; index += 1) {
    const addButton = page.getByRole("button", { name: "Add 5" });
    if ((await addButton.count()) > 0) break;

    const unanswered = page.locator(".quiz-card").filter({ has: page.getByRole("button", { name: "Submit answer" }) }).first();
    if ((await unanswered.count()) === 0) break;

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

  await addButton.click();
  await expect
    .poll(async () => {
      const afterText = await page.locator(".today-quiz-summary strong").innerText();
      return Number(afterText.split("/")[1]?.trim());
    })
    .toBeGreaterThan(beforeTotal);
});
