// @vitest-environment node

import { describe, expect, it } from "vitest";
import { createSessionToken, verifySessionToken } from "@/lib/auth/session";
import { verifyFixedPassword } from "@/lib/auth/password";

describe("verifyFixedPassword", () => {
  it("accepts the configured password", () => {
    expect(verifyFixedPassword("secret", "secret")).toBe(true);
  });

  it("rejects an incorrect password", () => {
    expect(verifyFixedPassword("secret", "wrong")).toBe(false);
  });
});

describe("session tokens", () => {
  it("creates a signed token that expires in 24 hours", async () => {
    const now = new Date("2026-07-08T00:00:00.000Z");
    const session = await createSessionToken("12345678901234567890123456789012", now);
    const verified = await verifySessionToken(
      session.token,
      "12345678901234567890123456789012",
      now,
    );

    expect(verified.authenticated).toBe(true);
    expect(session.expiresAt.toISOString()).toBe("2026-07-09T00:00:00.000Z");
  });
});
