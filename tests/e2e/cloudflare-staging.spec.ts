import { expect, test } from "@playwright/test";

const stagingBaseUrl = process.env.STAGING_BASE_URL;
const stagingEmail = process.env.STAGING_LOGIN_EMAIL;
const stagingPassword = process.env.STAGING_LOGIN_PASSWORD;

test.describe("Cloudflare staging", () => {
  test.skip(!stagingBaseUrl || !stagingEmail || !stagingPassword, "staging credentials are required");

  test("redirects safely, logs in, and prepares five Today questions without answering", async ({ page }) => {
    await page.goto("/docs/cloud-migration?source=e2e");
    await expect(page).toHaveURL((url) => url.pathname === "/login" && url.searchParams.get("next") === "/docs/cloud-migration?source=e2e");

    await page.getByLabel("Email").fill(stagingEmail!);
    await page.getByLabel("Password").fill(stagingPassword!);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/docs\/cloud-migration\?source=e2e$/);
    await expect(page.getByRole("heading", { name: "Cloud migration" })).toBeVisible();

    await page.goto("/today");
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
    await expect(page.getByText("0 / 5").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Go to question [1-5], unanswered/ })).toHaveCount(5);
    await expect(page.getByRole("button", { name: "Submit answer" })).toBeVisible();
  });

  test("renders Podcast safely when staging has no copied personal episodes", async ({ page }) => {
    await page.goto("/login?next=%2Fpodcast");
    await page.getByLabel("Email").fill(stagingEmail!);
    await page.getByLabel("Password").fill(stagingPassword!);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/podcast$/);
    await expect(page.getByRole("heading", { name: /Podcast/i })).toBeVisible();
    await expect(page.getByText(/error|exception/i)).toHaveCount(0);
  });

  test("publishes OAuth metadata and rejects unauthenticated MCP calls", async ({ request }) => {
    const metadata = await request.get("/.well-known/oauth-authorization-server");
    expect(metadata.status()).toBe(200);
    await expect(metadata.json()).resolves.toMatchObject({
      issuer: stagingBaseUrl,
      authorization_endpoint: `${stagingBaseUrl}/oauth/authorize`,
      token_endpoint: `${stagingBaseUrl}/oauth/token`,
    });

    const unauthorized = await request.post("/mcp", {
      headers: { accept: "application/json, text/event-stream" },
      data: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    });
    expect(unauthorized.status()).toBe(401);
    expect(unauthorized.headers()["www-authenticate"]).toContain("/.well-known/oauth-protected-resource/mcp");
  });
});
