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
  const activeCard = navigator.locator('.quiz-card[aria-current="step"]');
  const controls = page.getByRole("navigation", { name: "Question navigation" });
  const footer = page.getByRole("navigation", { name: "Primary" });
  await expect(cards).toHaveCount(1);
  await expect(activeCard).toHaveCount(1);
  await expect(activeCard).toBeVisible();
  await expect(controls).toBeVisible();
  await expect(footer).toBeVisible();
  await expect(navigator).toHaveCSS("touch-action", "pan-y");
  const getActiveCardLayout = () => activeCard.evaluate((card) => {
    const bounds = card.getBoundingClientRect();
    return {
      top: bounds.top,
      bottom: bounds.bottom,
      left: bounds.left,
      right: bounds.right,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentWidth: document.documentElement.scrollWidth,
    };
  });

  await activeCard.scrollIntoViewIfNeeded();
  let cardLayout = await getActiveCardLayout();
  await expect(activeCard.getByRole("heading")).toBeVisible();
  expect(cardLayout.top).toBeLessThan(cardLayout.viewportHeight);
  expect(cardLayout.bottom).toBeGreaterThan(0);
  expect(Math.ceil(cardLayout.left)).toBeGreaterThanOrEqual(0);
  expect(Math.floor(cardLayout.right)).toBeLessThanOrEqual(cardLayout.viewportWidth);
  expect(cardLayout.documentWidth).toBeLessThanOrEqual(cardLayout.viewportWidth);

  await activeCard.evaluate((card) => card.scrollIntoView({ block: "end" }));
  cardLayout = await getActiveCardLayout();
  await expect(activeCard.getByRole("heading")).toBeVisible();
  expect(cardLayout.top).toBeLessThan(cardLayout.viewportHeight);
  expect(cardLayout.bottom).toBeGreaterThan(0);
  expect(Math.ceil(cardLayout.left)).toBeGreaterThanOrEqual(0);
  expect(Math.floor(cardLayout.right)).toBeLessThanOrEqual(cardLayout.viewportWidth);

  const total = Number((await page.locator(".today-quiz-summary strong").innerText()).split("/")[1]?.trim());
  test.skip(total < 3, "Quiz card navigation flow requires at least three seeded questions.");
  await expect(page.getByText(`1 / ${total}`, { exact: true })).toBeVisible();
  const previous = page.getByRole("button", { name: "Previous question" });
  const next = page.getByRole("button", { name: "Next question" });
  await expect(previous).toBeDisabled();
  await expect(next).toBeVisible();
  await next.scrollIntoViewIfNeeded();
  cardLayout = await getActiveCardLayout();
  await expect(activeCard.getByRole("heading")).toBeVisible();
  expect(cardLayout.top).toBeLessThan(cardLayout.viewportHeight);
  expect(cardLayout.bottom).toBeGreaterThan(0);
  expect(Math.ceil(cardLayout.left)).toBeGreaterThanOrEqual(0);
  expect(Math.floor(cardLayout.right)).toBeLessThanOrEqual(cardLayout.viewportWidth);

  const controlsLayout = await controls.evaluate((controlsElement) => {
    const footerElement = document.querySelector(".app-nav");
    if (!footerElement) throw new Error("Fixed footer not found");
    return {
      controlsBottom: controlsElement.getBoundingClientRect().bottom,
      footerTop: footerElement.getBoundingClientRect().top,
    };
  });
  expect(controlsLayout.controlsBottom).toBeLessThanOrEqual(controlsLayout.footerTop);

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

test("answering a skipped card preserves its review and advances to the next unanswered card", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("local@example.com");
  await page.getByLabel("Password").fill("local-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByRole("link", { name: "Today" }).click();

  const navigator = page.getByLabel("Quiz questions");
  const card = navigator.locator(".quiz-card");
  const total = Number((await page.locator(".today-quiz-summary strong").innerText()).split("/")[1]?.trim());
  const firstQuestion = await card.getByRole("heading").innerText();

  test.skip(total < 3, "The seeded daily quiz needs three cards for this flow.");

  await page.getByRole("button", { name: "Next question" }).click();
  const submittedQuestion = await card.getByRole("heading").innerText();
  await card.locator('input[name="selectedChoiceId"]').first().check();
  await card.locator('input[name="confidence"][value="4"]').check();
  await card.locator('textarea[name="reasoning"]').fill("I compared the contract before choosing this answer.");
  await card.getByRole("button", { name: "Submit answer" }).click();

  await expect(page).toHaveURL(/\/today/);
  await expect(card.getByRole("heading")).not.toHaveText(submittedQuestion);
  await expect(card.getByRole("heading")).not.toHaveText(firstQuestion);
  await expect(page.getByText(`3 / ${total}`, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Previous question" }).click();
  await expect(card.getByRole("heading")).toHaveText(submittedQuestion);
  await expect(card.getByLabel("Answer review")).toBeVisible();
  await expect(card.locator(".answer-badge.selected")).toBeVisible();

  await page.getByRole("button", { name: "Previous question" }).click();
  await expect(card.getByRole("heading")).toHaveText(firstQuestion);
  await expect(card.getByRole("button", { name: "Submit answer" })).toBeVisible();
});

test("user can add more questions after completing the current set", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("local@example.com");
  await page.getByLabel("Password").fill("local-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByRole("link", { name: "Today" }).click();

  const total = Number((await page.locator(".today-quiz-summary strong").innerText()).split("/")[1]?.trim());

  const maxSetupAttempts = total;
  for (let attempt = 0; attempt < maxSetupAttempts; attempt += 1) {
    const addButton = page.getByRole("button", { name: "Add 5" });
    if ((await addButton.count()) > 0) break;

    const activeCard = page.locator('.quiz-card[aria-current="step"]');
    await expect(activeCard).toHaveCount(1);
    const submitButton = activeCard.getByRole("button", { name: "Submit answer" });
    if ((await submitButton.count()) === 0) {
      const nextButton = page.getByRole("button", { name: "Next question" });
      if (await nextButton.isDisabled()) break;
      await nextButton.click();
      continue;
    }

    await activeCard.locator('input[name="selectedChoiceId"]').first().check();
    await activeCard.locator('textarea[name="reasoning"]').fill("I am finishing the current set before adding more practice.");
    await submitButton.click();
    await expect(page).toHaveURL(/\/today/);
  }

  const beforeText = await page.locator(".today-quiz-summary strong").innerText();
  const beforeTotal = Number(beforeText.split("/")[1]?.trim());
  const addButton = page.getByRole("button", { name: "Add 5" });
  const addAction = page.locator(".add-questions-action");
  const controls = page.getByRole("navigation", { name: "Question navigation" });
  const footer = page.getByRole("navigation", { name: "Primary" });
  await expect(addAction).toHaveCount(1);
  await expect(addAction).toBeVisible();
  await expect(addButton).toHaveCount(1);
  await expect(addButton).toBeVisible();
  await expect(controls).toBeVisible();
  await expect(footer).toBeVisible();

  const placement = await addButton.evaluate((element) => {
    const action = element.closest(".add-questions-action");
    const controls = document.querySelector(".quiz-card-controls");
    const footer = document.querySelector(".app-nav");
    if (!action || !controls || !footer) throw new Error("Add action, quiz controls, or fixed footer not found");
    const actionBounds = action.getBoundingClientRect();
    const buttonBounds = element.getBoundingClientRect();
    return {
      actionTop: actionBounds.top,
      actionBottom: actionBounds.bottom,
      actionLeft: actionBounds.left,
      actionRight: actionBounds.right,
      buttonTop: buttonBounds.top,
      buttonBottom: buttonBounds.bottom,
      buttonLeft: buttonBounds.left,
      buttonRight: buttonBounds.right,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      actionPosition: getComputedStyle(action).position,
      controlsTop: controls.getBoundingClientRect().top,
      footerTop: footer.getBoundingClientRect().top,
    };
  });
  expect(Math.ceil(placement.actionTop)).toBeGreaterThanOrEqual(0);
  expect(Math.floor(placement.actionBottom)).toBeLessThanOrEqual(placement.viewportHeight);
  expect(Math.ceil(placement.actionBottom)).toBeGreaterThanOrEqual(0);
  expect(Math.ceil(placement.actionLeft)).toBeGreaterThanOrEqual(0);
  expect(Math.floor(placement.actionRight)).toBeLessThanOrEqual(placement.viewportWidth);
  expect(Math.ceil(placement.buttonTop)).toBeGreaterThanOrEqual(0);
  expect(Math.floor(placement.buttonBottom)).toBeLessThanOrEqual(placement.viewportHeight);
  expect(Math.ceil(placement.buttonBottom)).toBeGreaterThanOrEqual(0);
  expect(Math.ceil(placement.buttonLeft)).toBeGreaterThanOrEqual(0);
  expect(Math.floor(placement.buttonRight)).toBeLessThanOrEqual(placement.viewportWidth);
  expect(placement.actionPosition).toBe("sticky");
  expect(placement.actionBottom).toBeLessThanOrEqual(placement.controlsTop);
  expect(placement.actionBottom).toBeLessThanOrEqual(placement.footerTop);
  await addButton.click();
  await expect
    .poll(async () => {
      const afterText = await page.locator(".today-quiz-summary strong").innerText();
      return Number(afterText.split("/")[1]?.trim());
    })
    .toBeGreaterThan(beforeTotal);
});
