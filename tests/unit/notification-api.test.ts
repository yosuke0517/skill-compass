// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { handleNotificationRequest } from "@/lib/notifications/http";
const endpoint = "https://web.push.apple.com/id";
function setup() {
  const repo = {
    status: vi.fn().mockResolvedValue({ enabled: false, time: "09:00", lastError: null }),
    save: vi.fn(),
    disable: vi.fn(),
    claimTest: vi.fn(),
    complete: vi.fn(),
  };
  const send = vi.fn().mockResolvedValue(201);
  return {
    repo,
    send,
    configured: true,
    userId: "user",
    readOnly: false,
    now: new Date("2026-09-21T00:00:00Z"),
  };
}
function request(body: unknown, origin = "https://example.com") {
  return new Request("https://example.com/api/notifications", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
describe("notification API", () => {
  it("refuses cross-site requests without touching storage", async () => {
    const deps = setup();
    const res = await handleNotificationRequest(
      request({ action: "disable", endpoint }, "https://other.test"),
      deps,
    );
    expect(res.status).toBe(403);
    expect(deps.repo.disable).not.toHaveBeenCalled();
  });
  it("does not let unauthenticated callers read or write", async () => {
    const deps = setup();
    const res = await handleNotificationRequest(request({ action: "status", endpoint }), {
      ...deps,
      userId: null,
    });
    expect(res.status).toBe(401);
    expect(deps.repo.status).not.toHaveBeenCalled();
  });
  it("scopes reads to the authenticated owner", async () => {
    const deps = setup();
    const res = await handleNotificationRequest(request({ action: "status", endpoint }), deps);
    expect(await res.json()).toEqual({ enabled: false, time: "09:00", lastError: null });
    expect(deps.repo.status).toHaveBeenCalledWith("user", endpoint);
  });
  it("refuses saving when delivery is not configured", async () => {
    const deps = setup();
    const res = await handleNotificationRequest(
      request({
        action: "save",
        time: "09:00",
        subscription: { endpoint, keys: { p256dh: "B" + "A".repeat(86), auth: "A".repeat(22) } },
      }),
      { ...deps, configured: false },
    );
    expect(res.status).toBe(503);
    expect(deps.repo.save).not.toHaveBeenCalled();
  });
  it("allows disable during configuration outage", async () => {
    const deps = setup();
    const res = await handleNotificationRequest(request({ action: "disable", endpoint }), {
      ...deps,
      configured: false,
    });
    expect(res.status).toBe(200);
    expect(deps.repo.disable).toHaveBeenCalledWith("user", endpoint);
  });
  it("does not send unowned, disabled or rate-limited test subscriptions", async () => {
    const deps = setup();
    deps.repo.claimTest.mockResolvedValue(null);
    const res = await handleNotificationRequest(request({ action: "test", endpoint }), deps);
    expect(res.status).toBe(429);
    expect(deps.send).not.toHaveBeenCalled();
  });
  it("disables a gone endpoint and reports failure rather than success", async () => {
    const deps = setup();
    const row = { endpoint, p256dh: "x", auth: "y" };
    deps.repo.claimTest.mockResolvedValue(row);
    deps.send.mockResolvedValue(410);
    const res = await handleNotificationRequest(request({ action: "test", endpoint }), deps);
    expect(res.status).toBe(410);
    expect(deps.repo.complete).toHaveBeenCalledWith(row, "subscription_expired", true);
  });
  it("returns a safe conflict without exposing subscriptions", async () => {
    const deps = setup();
    deps.repo.save.mockRejectedValue(new Error("subscription_conflict"));
    const res = await handleNotificationRequest(
      request({
        action: "save",
        time: "09:00",
        subscription: { endpoint, keys: { p256dh: "B" + "A".repeat(86), auth: "A".repeat(22) } },
      }),
      deps,
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "subscription_conflict" });
  });
  it("honors read-only maintenance and body size limits", async () => {
    const deps = setup();
    expect(
      (
        await handleNotificationRequest(request({ action: "disable", endpoint }), {
          ...deps,
          readOnly: true,
        })
      ).status,
    ).toBe(503);
    expect(
      (await handleNotificationRequest(request({ data: "x".repeat(9000) }), deps)).status,
    ).toBe(413);
  });
});
