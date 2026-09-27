import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`does not serve retired Guide at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const response = await page.goto("/docs/cloud-migration?source=e2e");
    expect(response?.status()).toBe(410);
    await expect(page.getByText("This page is no longer available.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Cloud migration" })).toHaveCount(0);
  });
}
