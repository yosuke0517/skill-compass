import { expect, test } from "@playwright/test";

test("authenticated user can navigate all MVP management screens", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Password").fill("local-password");
  await page.getByRole("button", { name: "Log in" }).click();

  await page.getByRole("link", { name: "Skills" }).click();
  await expect(page).toHaveURL(/\/skills/);
  await expect(page.getByRole("heading", { name: "Skills" })).toBeVisible();
  await expect(page.getByText("Frontend").first()).toBeVisible();

  await page.getByRole("link", { name: /Conce/ }).click();
  await expect(page).toHaveURL(/\/concepts/);
  await expect(page.getByRole("heading", { name: "Concepts" })).toBeVisible();
  await expect(page.getByText("API contract").first()).toBeVisible();

  await page.getByRole("link", { name: "Sources" }).click();
  await expect(page).toHaveURL(/\/sources/);
  await expect(page.getByRole("heading", { name: "Sources" })).toBeVisible();
  await expect(page.getByText("TypeScript Handbook").first()).toBeVisible();

  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings/);
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByText("Fixed password, signed 24 hour session")).toBeVisible();
});

test("primary navigation stays fixed while scrolling long screens", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Password").fill("local-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByRole("link", { name: "Today" }).click();

  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav).toBeVisible();
  const before = await nav.boundingBox();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const after = await nav.boundingBox();

  expect(await nav.evaluate((element) => getComputedStyle(element).position)).toBe("fixed");
  expect(after?.y).toBeCloseTo(before?.y ?? 0, 1);
});
