import { expect, test } from "@playwright/test";

test("pro user can open Podcast settings", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("local@example.com");
  await page.getByLabel("Password").fill("local-password");
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page.getByRole("link", { name: "Podcast" })).toBeVisible();
  await page.getByRole("link", { name: "Podcast" }).click();
  await expect(page.getByRole("heading", { name: "Podcast" })).toBeVisible();
  await page.getByRole("link", { name: "Podcast settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sources" })).toBeVisible();
  await expect(page.getByText("Google Calendar")).toBeVisible();
});

test("pro user can queue one daily podcast preview", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("local@example.com");
  await page.getByLabel("Password").fill("local-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.goto("/podcast");

  await page.getByRole("button", { name: "Generate preview" }).click();
  await expect(page).toHaveURL(/\/podcast\?saved=(queued|already-queued)/);
  await expect(page.getByText(/generation|Today's generation/i)).toBeVisible();
});
