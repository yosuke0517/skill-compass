// @vitest-environment node

import { describe, expect, it } from "vitest";

import { createOAuthState, verifyOAuthState } from "@/lib/integrations/oauth-state";

describe("OAuth state", () => {
  const now = new Date("2026-07-14T00:00:00.000Z");

  it("binds a short-lived state to its provider and user", async () => {
    const token = await createOAuthState({ provider: "google-calendar", userId: "user_local", secret: "local-test-secret-which-is-long-enough", now });
    await expect(verifyOAuthState(token, "local-test-secret-which-is-long-enough", now)).resolves.toEqual({ provider: "google-calendar", userId: "user_local" });
  });

  it("rejects a state with the wrong secret or after expiry", async () => {
    const token = await createOAuthState({ provider: "x", userId: "user_local", secret: "local-test-secret-which-is-long-enough", now, ttlSeconds: 60 });
    await expect(verifyOAuthState(token, "another-local-test-secret-which-is-long-enough", now)).resolves.toBeNull();
    await expect(verifyOAuthState(token, "local-test-secret-which-is-long-enough", new Date("2026-07-14T00:02:00.000Z"))).resolves.toBeNull();
  });
});
