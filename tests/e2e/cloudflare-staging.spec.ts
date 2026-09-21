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

  test("serves an installable PWA and opt-in notification settings", async ({ page, request }) => {
    const manifest = await request.get("/manifest.webmanifest");
    expect(manifest.status()).toBe(200);
    await expect(manifest.json()).resolves.toMatchObject({ start_url: "/today", display: "standalone" });
    const sw = await request.get("/sw.js");
    expect(sw.status()).toBe(200);
    expect(sw.headers()["content-type"]).toMatch(/javascript/);
    expect((await request.get("/api/notifications")).status()).toBe(401);

    await page.goto("/login?next=%2Fsettings");
    await page.getByLabel("Email").fill(stagingEmail!);
    await page.getByLabel("Password").fill(stagingPassword!);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/settings$/);
    const settings = page.getByRole("region", { name: "Today reminder" });
    await expect(settings.getByText("Off", { exact: true })).toBeVisible();
    await expect(settings.getByLabel("Reminder time")).toHaveValue("09:00");
    await expect(settings.getByRole("button", { name: "Enable reminders" })).toBeEnabled();
    await expect.poll(() => page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration("/"))?.active))).toBe(true);
    // Viewing settings must not request notification permission or create a subscription.
    expect(await page.evaluate(() => Notification.permission)).toBe("default");
    expect(await page.evaluate(async () => (await navigator.serviceWorker.ready).pushManager.getSubscription())).toBeNull();
    const config = await page.request.get("/api/notifications");
    expect(config.status()).toBe(200);
    expect(await config.json()).toMatchObject({ configured: true, publicKey: expect.stringMatching(/^[A-Za-z0-9_-]{87}$/) });
    const crossSite = await page.request.post("/api/notifications", {
      headers: { origin: "https://untrusted.example" },
      data: { action: "disable", endpoint: "https://web.push.apple.com/test" },
    });
    expect(crossSite.status()).toBe(403);
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
