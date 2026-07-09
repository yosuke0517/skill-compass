import { expect, test } from "@playwright/test";

test("user can ask the Today assistant from the floating button", async ({ page }) => {
  await page.route("**/api/assistant/today", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ answer: "API契約の互換性を見る問題です。まず破壊的変更かどうかに注目しましょう。", provider: "test" }),
    });
  });

  await page.goto("/login");
  await page.getByLabel("Password").fill("local-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByRole("link", { name: "Today" }).click();

  const openButton = page.getByLabel("Open Today assistant");
  await expect(openButton).toBeVisible();
  await openButton.click();

  await expect(page.getByRole("region", { name: "Today assistant" })).toBeVisible();
  await page.getByLabel("Ask the Today assistant").fill("この問題を説明して");
  await page.getByLabel("Send question").click();

  await expect(page.getByText("API契約の互換性を見る問題です")).toBeVisible();
});

test("Today assistant stays floating while the quiz page scrolls", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Password").fill("local-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByRole("link", { name: "Today" }).click();

  const openButton = page.getByLabel("Open Today assistant");
  await expect(openButton).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(openButton).toBeVisible();

  const placement = await openButton.evaluate((element) => {
    const host = element.closest(".today-assistant");
    const hostStyle = host ? getComputedStyle(host) : null;
    const buttonStyle = getComputedStyle(element);
    return {
      buttonRadius: buttonStyle.borderRadius,
      hostBottom: host?.getBoundingClientRect().bottom ?? 0,
      hostPosition: hostStyle?.position,
      navTop: document.querySelector(".app-nav")?.getBoundingClientRect().top ?? 0,
    };
  });

  expect(placement.hostPosition).toBe("fixed");
  expect(placement.hostBottom).toBeLessThan(placement.navTop);
  expect(placement.buttonRadius).toBe("999px");
});

test("Today assistant shows pending feedback while answering", async ({ page }) => {
  await page.route("**/api/assistant/today", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ answer: "ヒントです。選択肢の変更が既存クライアントにどう影響するかを見ましょう。", provider: "test" }),
    });
  });

  await page.goto("/login");
  await page.getByLabel("Password").fill("local-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByRole("link", { name: "Today" }).click();
  await page.getByLabel("Open Today assistant").click();

  await page.getByRole("button", { name: "ヒントだけください" }).click();
  await expect(page.getByLabel("Assistant thinking")).toBeVisible();
  await expect(page.getByText("ヒントです")).toBeVisible();
});
