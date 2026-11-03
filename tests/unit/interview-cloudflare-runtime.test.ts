// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { interviewD1 } from "../helpers/interview-d1";
const context = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: async () => context }));
import { relayRuntime } from "@/lib/interview/relay-runtime";
afterEach(() => vi.unstubAllEnvs());
it("routes browser operations through Cloudflare key guard and rejects public callbacks with 401", async () => {
  const { db, sql } = interviewD1();
  vi.stubEnv("INTERVIEW_RELAY_TRANSPORT", "cloudflare");
  vi.stubEnv("INTERVIEW_RELAY_MODE", "openai");
  vi.stubEnv("PUBLIC_APP_URL", "https://app.example");
  vi.stubEnv("OPENAI_API_KEY", "");
  context.env = { DB: db };
  try {
    const runtime = await relayRuntime();
    const admin = { id: "owner", role: "admin", entitlements: new Set(["access.manage"]) };
    await expect(runtime!.service.run("start", admin, {})).rejects.toMatchObject({ status: 503, code: "OPENAI_KEY_UNAVAILABLE" });
    expect(sql.prepare("SELECT COUNT(*) AS count FROM interview_relay_sessions").get()?.count).toBe(0);
    await expect(runtime!.verify(new Request("https://app.example/api/interview/relay/redeem"))).rejects.toMatchObject({ status: 401 });
  } finally { sql.close(); }
});
