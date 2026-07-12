import { expect, test } from "@playwright/test";

test("admin can open the access control workspace", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("local@example.com");
  await page.getByLabel("Password").fill("local-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.goto("/admin/access");

  await expect(page.getByRole("heading", { name: "アクセス管理" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "管理メニュー" })).toBeVisible();
  await expect(page.getByText("member@example.com")).toBeVisible();
  await expect(page.getByRole("heading", { name: "ユーザー権限" })).toBeVisible();
});

test("normal user cannot open the admin workspace", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("member@example.com");
  await page.getByLabel("Password").fill("local-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.goto("/admin/access");

  await expect(page).toHaveURL(/\/settings\?error=admin-required/);
});
