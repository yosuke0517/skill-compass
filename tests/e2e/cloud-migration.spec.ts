import { expect, test } from "@playwright/test";

async function logInFromMigrationRedirect(page: import("@playwright/test").Page) {
  await page.goto("/docs/cloud-migration");

  await expect(page).toHaveURL((url) =>
    url.pathname === "/login" && url.searchParams.get("next") === "/docs/cloud-migration",
  );
  await page.getByLabel("Email").fill("local@example.com");
  await page.getByLabel("Password").fill("local-password");
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page).toHaveURL(/\/docs\/cloud-migration$/);
  await expect(page.getByRole("heading", { name: "Cloud migration" })).toBeVisible();
}

test("returns an authenticated desktop visitor to the migration document", async ({ page }) => {
  await logInFromMigrationRedirect(page);

  await expect(page.getByText("Production traffic remains on the Mac mini.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Production approval" })).toBeVisible();
});

test("keeps the authenticated migration document within a 390px mobile viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await logInFromMigrationRedirect(page);

  await expect(page.getByRole("heading", { name: "Current architecture" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Target architecture" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
