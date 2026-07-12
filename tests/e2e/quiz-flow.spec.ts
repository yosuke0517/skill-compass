import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

test("today keeps one card focused while navigating and revisiting unanswered questions", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("local@example.com");
  await page.getByLabel("Password").fill("local-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByRole("link", { name: "Today" }).click();

  const navigator = page.getByLabel("Quiz questions");
  const cards = navigator.locator(".quiz-card");
  await expect(cards).toHaveCount(1);
  await expect(navigator).toHaveCSS("touch-action", "pan-y");

  const total = Number((await page.locator(".today-quiz-summary strong").innerText()).split("/")[1]?.trim());
  await expect(page.getByText(`1 / ${total}`, { exact: true })).toBeVisible();
  const previous = page.getByRole("button", { name: "Previous question" });
  const next = page.getByRole("button", { name: "Next question" });
  await expect(previous).toBeDisabled();
  await expect(next).toBeVisible();

  expect(total).toBeGreaterThan(1);
  const firstQuestion = await cards.getByRole("heading").innerText();

  await next.click();
  await expect(page.getByText(`2 / ${total}`, { exact: true })).toBeVisible();
  await expect(cards).toHaveCount(1);
  await expect(cards.getByRole("heading")).toBeFocused();
  await expect(previous).toBeEnabled();

  await navigator.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByText(`1 / ${total}`, { exact: true })).toBeVisible();
  await expect(previous).toBeDisabled();

  await page.keyboard.press("ArrowRight");
  await expect(page.getByText(`2 / ${total}`, { exact: true })).toBeVisible();

  await page.evaluate(() => {
    const navigator = document.querySelector<HTMLElement>(".quiz-card-navigator");
    if (!navigator) throw new Error("quiz navigator not found");
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    editor.innerHTML = '<span contenteditable="false" tabindex="0">Non-editable child</span>';
    navigator.append(editor);
    editor.querySelector<HTMLElement>("span")?.focus();
  });
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText(`3 / ${total}`, { exact: true })).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByText(`2 / ${total}`, { exact: true })).toBeVisible();

  await page.getByText(`2 / ${total}`, { exact: true }).click();
  await navigator.dispatchEvent("pointerdown", { pointerId: 1, pointerType: "touch", clientX: 300, clientY: 300 });
  await navigator.dispatchEvent("pointerup", { pointerId: 1, pointerType: "touch", clientX: 356, clientY: 300 });
  await expect(page.getByText(`2 / ${total}`, { exact: true })).toBeVisible();

  await navigator.dispatchEvent("pointerdown", { pointerId: 2, pointerType: "touch", clientX: 300, clientY: 300 });
  await navigator.dispatchEvent("pointerup", { pointerId: 2, pointerType: "touch", clientX: 380, clientY: 400 });
  await expect(page.getByText(`2 / ${total}`, { exact: true })).toBeVisible();

  await navigator.getByRole("button", { name: "Open Today assistant" }).click();
  await page.getByLabel("Ask the Today assistant").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText(`2 / ${total}`, { exact: true })).toBeVisible();

  await page.evaluate(() => {
    const navigator = document.querySelector<HTMLElement>(".quiz-card-navigator");
    if (!navigator) throw new Error("quiz navigator not found");
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    editor.innerHTML = '<span tabindex="0">Editable child</span>';
    navigator.append(editor);
    editor.querySelector<HTMLElement>("span")?.focus();
  });
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText(`2 / ${total}`, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close assistant" }).click();

  await navigator.dispatchEvent("pointerdown", { pointerId: 1, pointerType: "touch", clientX: 300, clientY: 300 });
  await navigator.dispatchEvent("pointerup", { pointerId: 1, pointerType: "touch", clientX: 200, clientY: 310 });
  await expect(page.getByText(`3 / ${total}`, { exact: true })).toBeVisible();

  let activeQuestionNumber = 3;
  while (activeQuestionNumber < total && (await cards.getByRole("heading").innerText()) === firstQuestion) {
    await next.click();
    activeQuestionNumber += 1;
  }

  await expect(cards.getByRole("heading")).not.toHaveText(firstQuestion);
  const distinctQuestion = await cards.getByRole("heading").innerText();

  await previous.click();
  activeQuestionNumber -= 1;
  await expect(cards).toHaveCount(1);
  await expect(cards.getByRole("heading")).not.toHaveText(distinctQuestion);
  await expect(cards.getByRole("heading")).toBeFocused();

  while (activeQuestionNumber < total) {
    await next.click();
    activeQuestionNumber += 1;
  }
  await expect(next).toBeDisabled();

  const unansweredIndicator = navigator.locator(".quiz-card-indicators .unanswered").first();
  await expect(unansweredIndicator).toBeVisible();
  const unansweredNumber = Number((await unansweredIndicator.getAttribute("aria-label"))?.match(/Question (\d+)/)?.[1]);
  expect(unansweredNumber).toBeGreaterThan(0);

  while (activeQuestionNumber < unansweredNumber) {
    await next.click();
    activeQuestionNumber += 1;
  }
  while (activeQuestionNumber > unansweredNumber) {
    await previous.click();
    activeQuestionNumber -= 1;
  }

  const unansweredQuestion = await cards.getByRole("heading").innerText();
  if (unansweredNumber < total) {
    await next.click();
    await previous.click();
  } else {
    await previous.click();
    await next.click();
  }

  await expect(cards).toHaveCount(1);
  await expect(cards.getByRole("heading")).toHaveText(unansweredQuestion);
  await expect(cards.getByRole("heading")).toBeFocused();
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
