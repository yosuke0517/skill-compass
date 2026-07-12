import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("local@example.com");
  await page.getByLabel("Password").fill("local-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("pro user can open episode coach and submit a quick question", async ({ page }) => {
  await login(page);
  await page.route("**/api/podcast/episodes/*/chat", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ messages: [] }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ answer: "A concrete use case for this episode.", provider: "test" }) });
  });

  await page.goto("/podcast");
  const firstEpisode = page.locator(".podcast-episode-list article").first();
  await firstEpisode.getByRole("button", { name: "Ask this episode" }).click();
  const sheet = page.locator(".podcast-chat-sheet");
  await expect(sheet).toBeVisible();
  const sheetBox = await sheet.boundingBox();
  const textareaBox = await page.locator(".podcast-chat-form textarea").boundingBox();
  expect(sheetBox).not.toBeNull();
  expect(textareaBox).not.toBeNull();
  expect(textareaBox!.x + textareaBox!.width).toBeLessThanOrEqual(sheetBox!.x + sheetBox!.width);
  await expect(page.getByRole("switch", { name: "音声回答オフ" })).toBeVisible();

  await page.getByRole("button", { name: "実務のユースケースを教えて" }).click();
  await expect(page.getByText("実務のユースケースを教えて").last()).toBeVisible();
  await expect(page.getByText("A concrete use case for this episode.")).toBeVisible();
});
