import { expect, test } from "@playwright/test";

test("user can ask the Today assistant from the floating button", async ({ page }) => {
  const requests: Array<{ message?: string; messages?: Array<{ role: string; text: string }> }> = [];
  await page.route("**/api/assistant/today", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ answer: "API契約の互換性を見る問題です。まず破壊的変更かどうかに注目しましょう。", provider: "test" }),
    });
  });

  await page.goto("/login");
  await page.getByLabel("Email").fill("local@example.com");
  await page.getByLabel("Password").fill("local-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByRole("link", { name: "Today" }).click();

  const openButton = page.getByLabel("Open Today assistant");
  await expect(openButton).toBeVisible();
  await openButton.click();

  const sheet = page.getByRole("region", { name: "Today assistant" });
  await expect(sheet).toBeVisible();
  const sheetChrome = await sheet.evaluate((element) => {
    const chip = element.querySelector(".assistant-chips button");
    const inputForm = element.querySelector(".assistant-form");
    const sheetStyle = getComputedStyle(element);
    const chipStyle = chip ? getComputedStyle(chip) : null;
    const formStyle = inputForm ? getComputedStyle(inputForm) : null;
    return {
      background: sheetStyle.backgroundColor,
      borderRadius: sheetStyle.borderRadius,
      chipBackground: chipStyle?.backgroundColor,
      chipColor: chipStyle?.color,
      display: sheetStyle.display,
      formDisplay: formStyle?.display,
      orbVisible: !!document.querySelector(".assistant-orb"),
    };
  });

  expect(sheetChrome.background).toBe("rgb(255, 255, 255)");
  expect(sheetChrome.borderRadius).toBe("24px");
  expect(sheetChrome.chipBackground).toBe("rgb(238, 244, 255)");
  expect(sheetChrome.display).toBe("grid");
  expect(sheetChrome.formDisplay).toBe("grid");
  expect(sheetChrome.orbVisible).toBe(false);
  await page.getByLabel("Ask the Today assistant").fill("この問題を説明して");
  await page.getByLabel("Send question").click();

  await expect(page.getByText("API契約の互換性を見る問題です")).toBeVisible();
  expect(requests[0]?.message).toBe("この問題を説明して");
  expect(requests[0]?.messages?.at(-1)).toEqual({ role: "user", text: "この問題を説明して" });
  expect(requests[0]?.messages?.some((message) => message.role === "assistant")).toBe(true);
});

test("Today assistant sends previous chat turns with follow-up questions", async ({ page }) => {
  const requests: Array<{ message?: string; messages?: Array<{ role: string; text: string }> }> = [];
  await page.route("**/api/assistant/today", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ answer: requests.length === 1 ? "インデックスの話ですね。" : "前の話を踏まえると、書き込みコストの話です。", provider: "test" }),
    });
  });

  await page.goto("/login");
  await page.getByLabel("Email").fill("local@example.com");
  await page.getByLabel("Password").fill("local-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByRole("link", { name: "Today" }).click();
  await page.getByLabel("Open Today assistant").click();

  await page.getByLabel("Ask the Today assistant").fill("最後の問題について");
  await page.getByLabel("Send question").click();
  await expect(page.getByText("インデックスの話ですね。")).toBeVisible();

  await page.getByLabel("Ask the Today assistant").fill("検索が早くなり、遅くなるものはないのでは？");
  await page.getByLabel("Send question").click();
  await expect(page.getByText("前の話を踏まえると")).toBeVisible();

  expect(requests[1]?.message).toBe("検索が早くなり、遅くなるものはないのでは？");
  expect(requests[1]?.messages).toEqual(
    expect.arrayContaining([
      { role: "user", text: "最後の問題について" },
      { role: "assistant", text: "インデックスの話ですね。" },
      { role: "user", text: "検索が早くなり、遅くなるものはないのでは？" },
    ]),
  );
});

test("Today assistant sends the complete visible chat history", async ({ page }) => {
  const requests: Array<{ message?: string; messages?: Array<{ role: string; text: string }> }> = [];
  await page.route("**/api/assistant/today", async (route) => {
    const payload = route.request().postDataJSON();
    requests.push(payload);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ answer: `reply-${requests.length}`, provider: "test" }),
    });
  });

  await page.goto("/login");
  await page.getByLabel("Email").fill("local@example.com");
  await page.getByLabel("Password").fill("local-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByRole("link", { name: "Today" }).click();
  await page.getByLabel("Open Today assistant").click();

  for (let index = 1; index <= 7; index += 1) {
    await page.getByLabel("Ask the Today assistant").fill(`question-${index}`);
    await page.getByLabel("Send question").click();
    await expect(page.getByText(`reply-${index}`)).toBeVisible();
  }

  const lastMessages = requests.at(-1)?.messages ?? [];
  expect(lastMessages).toHaveLength(14);
  expect(lastMessages[0]).toEqual({ role: "assistant", text: "今日の問題について聞けます。迷った選択肢や、知りたい観点を送ってください。" });
  expect(lastMessages.at(-1)).toEqual({ role: "user", text: "question-7" });
});

test("Today assistant does not submit when the message field inserts a newline", async ({ page }) => {
  let requestCount = 0;
  await page.route("**/api/assistant/today", async (route) => {
    requestCount += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ answer: "送信されました。", provider: "test" }),
    });
  });

  await page.goto("/login");
  await page.getByLabel("Email").fill("local@example.com");
  await page.getByLabel("Password").fill("local-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByRole("link", { name: "Today" }).click();
  await page.getByLabel("Open Today assistant").click();

  const input = page.getByLabel("Ask the Today assistant");
  await input.fill("1行目");
  await input.press("Enter");
  await input.type("2行目");

  await expect(input).toHaveValue("1行目\n2行目");
  expect(requestCount).toBe(0);

  await page.getByLabel("Send question").click();
  await expect(page.getByText("送信されました。")).toBeVisible();
  expect(requestCount).toBe(1);
});

test("Today assistant stays floating while the quiz page scrolls", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/login");
  await page.getByLabel("Email").fill("local@example.com");
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
  await page.getByLabel("Email").fill("local@example.com");
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
  await page.getByLabel("Email").fill("local@example.com");
  await page.getByLabel("Password").fill("local-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByRole("link", { name: "Today" }).click();
  await page.getByLabel("Open Today assistant").click();

  await page.getByRole("button", { name: "ヒントだけください" }).click();
  await expect(page.getByLabel("Assistant thinking")).toBeVisible();
  await expect(page.getByText("ヒントです")).toBeVisible();
});
