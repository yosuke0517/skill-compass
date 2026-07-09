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
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/login");
  await page.getByLabel("Password").fill("local-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByRole("link", { name: "Today" }).click();

  const openButton = page.getByLabel("Open Today assistant");
  await expect(openButton).toBeVisible();
  const initial = await openButton.evaluate((element) => {
    const host = element.closest(".today-assistant");
    const card = document.querySelector(".quiz-card");
    return {
      buttonWidth: element.getBoundingClientRect().width,
      cardWidth: card?.getBoundingClientRect().width ?? 0,
      hostParent: host?.parentElement?.tagName,
      hostStyle: host?.getAttribute("style") ?? "",
      orbStyle: element.getAttribute("style") ?? "",
    };
  });

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(openButton).toBeVisible();

  const placement = await openButton.evaluate((element) => {
    const host = element.closest(".today-assistant");
    const hostStyle = host ? getComputedStyle(host) : null;
    const buttonStyle = getComputedStyle(element);
    const card = document.querySelector(".quiz-card");
    return {
      buttonRadius: buttonStyle.borderRadius,
      buttonWidth: element.getBoundingClientRect().width,
      cardWidth: card?.getBoundingClientRect().width ?? 0,
      hostBottom: host?.getBoundingClientRect().bottom ?? 0,
      hostParent: host?.parentElement?.tagName,
      hostStyle: host?.getAttribute("style") ?? "",
      hostPosition: hostStyle?.position,
      orbStyle: element.getAttribute("style") ?? "",
      navTop: document.querySelector(".app-nav")?.getBoundingClientRect().top ?? 0,
    };
  });

  expect(initial.hostParent).toBe("BODY");
  expect(placement.hostParent).toBe("BODY");
  expect(initial.hostStyle).toContain("position: fixed");
  expect(initial.orbStyle).toContain("linear-gradient");
  expect(placement.hostStyle).toContain("position: fixed");
  expect(placement.orbStyle).toContain("linear-gradient");
  expect(placement.hostPosition).toBe("fixed");
  expect(placement.hostBottom).toBeLessThanOrEqual(placement.navTop);
  expect(placement.buttonRadius).toBe("999px");
  expect(placement.buttonWidth).toBe(62);
  expect(placement.cardWidth).toBe(initial.cardWidth);
});

test("Today assistant button can be dragged without opening the sheet", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/login");
  await page.getByLabel("Password").fill("local-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByRole("link", { name: "Today" }).click();

  const openButton = page.getByLabel("Open Today assistant");
  await expect(openButton).toBeVisible();
  const before = await openButton.boundingBox();
  expect(before).not.toBeNull();

  await page.mouse.move(before!.x + before!.width / 2, before!.y + before!.height / 2);
  await page.mouse.down();
  await page.mouse.move(before!.x - 72, before!.y - 96, { steps: 8 });
  await page.mouse.up();

  const after = await openButton.boundingBox();
  expect(after).not.toBeNull();
  expect(after!.x).toBeLessThan(before!.x - 40);
  expect(after!.y).toBeLessThan(before!.y - 60);
  await expect(page.getByRole("region", { name: "Today assistant" })).toBeHidden();
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
