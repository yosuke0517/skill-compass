import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

test("the app shell keeps the five navigation items on one line", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("local@example.com");
  await page.getByLabel("Password").fill("local-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByRole("link", { name: "Today" }).click();

  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav).toBeVisible();
  await expect(nav.locator("a")).toHaveCount(5);
  await expect(nav).toHaveCSS("white-space", "nowrap");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("primary navigation links show a keyboard focus indicator", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("local@example.com");
  await page.getByLabel("Password").fill("local-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByRole("link", { name: "Today" }).click();

  const navLinks = page.getByRole("navigation", { name: "Primary" }).locator("a");
  await navLinks.nth(1).focus();
  await page.keyboard.press("Tab");
  const link = navLinks.nth(2);

  await expect(link).toBeFocused();
  await expect(link).toHaveCSS("outline-style", "solid");
  await expect(link).toHaveCSS("outline-width", "3px");
});
