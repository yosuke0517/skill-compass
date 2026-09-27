import { NextRequest } from "next/server";
import { expect, it, vi } from "vitest";
import { middleware } from "@/middleware";

vi.mock("@/lib/auth/session", () => ({
  SESSION_COOKIE_NAME: "session",
  verifySessionToken: vi.fn().mockResolvedValue({ authenticated: false }),
}));

it("retires the Guide before authentication rather than redirecting to login", async () => {
  for (const path of ["/docs/cloud-migration", "/docs/cloud-migration/?source=e2e"]) {
    const result = await middleware(new NextRequest(`https://example.test${path}`));
    expect(result.status).toBe(410);
    expect(result.headers.get("location")).toBeNull();
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(await result.text()).toBe("This page is no longer available.");
  }
});

it("keeps other docs protected by authentication", async () => {
  const result = await middleware(new NextRequest("https://example.test/docs/other"));
  expect(result.status).toBe(307);
  expect(result.headers.get("location")).toContain("/login?next=");
});
