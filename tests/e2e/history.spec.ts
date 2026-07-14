import { expect, test } from "@playwright/test";

test("user can browse answered quiz history from the dashboard", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("local@example.com");
  await page.getByLabel("Password").fill("local-password");
  await page.getByRole("button", { name: "Log in" }).click();

  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Today" }).click();
  const unansweredQuestion = page.locator(".quiz-card", {
    has: page.getByRole("button", { name: "Submit answer" }),
  }).first();

  if (await unansweredQuestion.isVisible()) {
    await unansweredQuestion.getByRole("radio").first().check();
    await unansweredQuestion.getByRole("button", { name: "3" }).click();
    await unansweredQuestion
      .getByPlaceholder("Why does this answer fit the source?")
      .fill("This answer matches the expected behavior and tradeoff.");
    await unansweredQuestion.getByRole("button", { name: "Submit answer" }).click();
    await expect(unansweredQuestion.getByText(/Correct|Review/).first()).toBeVisible();
  }

  await page.getByRole("link", { name: "Dash" }).click();
  await page.getByRole("link", { name: "Browse answered days" }).click();

  await expect(page).toHaveURL(/\/history/);
  await expect(page.getByRole("heading", { name: "Archive" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" }).getByText("Archive")).toBeVisible();
  await expect(page.locator(".history-days a").first()).toBeVisible();
  await expect(page.getByText("Your answer").first()).toBeVisible();
  await expect(page.getByText("Expected").first()).toBeVisible();
  await expect(page.getByText("Reasoning").first()).toBeVisible();
});

test("user can search answered history", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("local@example.com");
  await page.getByLabel("Password").fill("local-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/history");

  await page.getByRole("searchbox", { name: "Search archive" }).fill("index");
  await page.getByRole("button", { name: "Search" }).click();

  await expect(page).toHaveURL(/\/history\?q=index/);
  await expect(page.getByRole("region", { name: "Search results" })).toBeVisible();
  await expect(page.getByText(/matches/)).toBeVisible();
});
