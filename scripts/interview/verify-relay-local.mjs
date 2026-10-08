import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
const password = JSON.parse(readFileSync(".private/interview/credentials.json")).password;
const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});
const base = "http://127.0.0.1:4320";
try {
  for (const who of ["anonymous", "preview_normal", "preview_pro"]) {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await p.goto(base + "/login");
    if (who !== "anonymous") {
      await p.locator('input[name="email"]').fill(who + "@skill-compass.invalid");
      await p.locator('input[name="password"]').fill(password);
      const reply = p.waitForResponse(
        (r) => r.request().method() === "POST" && r.url().includes("/login"),
      );
      await p.locator('button[type="submit"]').click();
      await reply;
    }
    for (const op of ["start", "reconnect", "pulse", "stop", "audio", "hint"]) {
      const reply = await ctx.request.post(base + "/api/admin/interview/" + op, {
        headers: { origin: base },
        data: { role: "admin" },
      });
      assert.equal(reply.status(), who === "anonymous" ? 401 : 403);
    }
    console.log(who + " authorization passed");
    await ctx.close();
  }
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => {
    window.__tracks = [];
    window.__sockets = [];
    window.__acks = 0;
    const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (x) => {
      const s = await gum(x);
      window.__tracks.push(...s.getTracks());
      return s;
    };
    const Native = window.WebSocket;
    window.WebSocket = class extends Native {
      constructor(...args) {
        super(...args);
        window.__sockets.push(this);
        this.addEventListener("message", (e) => {
          try {
            if (JSON.parse(e.data).type === "ack") window.__acks++;
          } catch {}
        });
      }
    };
  });
  const page = await ctx.newPage();
  await page.goto(base + "/login?next=/admin/interview");
  await page.locator('input[name="email"]').fill("preview_admin@skill-compass.invalid");
  await page.locator('input[name="password"]').fill(password);
  const login = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().includes("/login"),
  );
  await page.locator('button[type="submit"]').click();
  await login;
  await page.goto(base + "/admin/interview");
  await page.getByRole("heading", { name: "面接サポート", exact: true }).waitFor();
  const invalid = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const ws = new WebSocket("ws://127.0.0.1:4318/audio");
        let ready = false;
        ws.onopen = () => ws.send(JSON.stringify({ type: "authorize", ticket: "a".repeat(64) }));
        ws.onmessage = (e) => {
          if (JSON.parse(e.data).type === "ready") ready = true;
        };
        ws.onclose = () => resolve(!ready);
      }),
  );
  assert.equal(invalid, true);
  assert.equal(
    (
      await ctx.request.post(base + "/api/interview/relay/redeem", {
        data: { ticket: "a".repeat(64), nonce: "x" },
      })
    ).status(),
    401,
  );
  await page.getByLabel("面接官の音声", { exact: true }).selectOption("device");
  const start = page.waitForResponse((r) => r.url().endsWith("/interview/start"));
  await page.getByRole("button", { name: "開始", exact: true }).click();
  const initial = await (await start).json();
  assert.ok(initial.ticket);
  await page.getByText("実行中 · 音声取得中", { exact: true }).waitFor();
  await page.waitForFunction(() => window.__acks > 1);
  await page
    .getByText("困難な課題を解決した経験を教えてください。（音声イベントのサンプル）", {
      exact: false,
    })
    .waitFor();
  await page.getByText("自分が実際に経験した例を選ぶ", { exact: true }).waitFor();
  const replay = await page.evaluate(
    (ticket) =>
      new Promise((resolve) => {
        const ws = new WebSocket("ws://127.0.0.1:4318/audio");
        let ready = false;
        ws.onopen = () => ws.send(JSON.stringify({ type: "authorize", ticket }));
        ws.onmessage = (e) => {
          if (JSON.parse(e.data).type === "ready") ready = true;
        };
        ws.onclose = () => resolve(!ready);
      }),
    initial.ticket,
  );
  assert.equal(replay, true);
  mkdirSync("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/interview-relay-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: "test-results/interview-relay-mobile.png", fullPage: true });
  await page.evaluate(() => {
    const s = window.__sockets.find((s) => s.readyState === WebSocket.OPEN);
    s.close();
  });
  await page.getByText("一時停止", { exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() => window.__tracks.every((t) => t.readyState === "ended")),
    true,
  );
  const reconnect = page.waitForResponse((r) => r.url().endsWith("/interview/reconnect"));
  await page.getByRole("button", { name: "再接続" }).click();
  const next = await (await reconnect).json();
  assert.equal(next.expiresAt, initial.expiresAt);
  await page.getByText("実行中 · 音声取得中", { exact: true }).waitFor();
  const stopped = page.waitForResponse((r) => r.url().endsWith("/interview/stop"));
  await page.getByRole("button", { name: "停止・表示を消去" }).click();
  assert.equal((await stopped).status(), 200);
  assert.equal(
    await page.evaluate(() => window.__tracks.every((t) => t.readyState === "ended")),
    true,
  );
  assert.equal(await page.getByText("自分が実際に経験した例を選ぶ", { exact: true }).count(), 0);
  await page.getByLabel("利用時間").selectOption("full");
  await page.getByLabel("面接官の音声", { exact: true }).selectOption("sample");
  await page.getByRole("button", { name: "開始", exact: true }).click();
  await page.getByText("実行中", { exact: true }).waitFor();
  await ctx.clearCookies();
  await page.getByText("一時停止", { exact: true }).waitFor({ timeout: 22000 });
  console.log(
    "Admin: PCM acknowledgements, sample hints, ticket replay rejection, disconnect/reconnect same deadline, stop clears tracks/text, logout fails closed, desktop/mobile passed",
  );
  await ctx.close();
} finally {
  await browser.close();
}
