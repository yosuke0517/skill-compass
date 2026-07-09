// @vitest-environment node

import { describe, expect, it } from "vitest";
import { createSessionToken, verifySessionToken } from "@/lib/auth/session";
import { hashPassword, verifyPasswordHash } from "@/lib/auth/password";

describe("password hashes", () => {
  it("stores passwords as salted scrypt hashes", async () => {
    const passwordHash = await hashPassword("secret", {
      salt: Buffer.from("0123456789abcdef"),
      keyLength: 32,
    });

    expect(passwordHash).toMatch(/^scrypt\$16384\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(passwordHash).not.toContain("secret");
    await expect(verifyPasswordHash(passwordHash, "secret")).resolves.toBe(true);
  });

  it("rejects a password that does not match the hash", async () => {
    const passwordHash = await hashPassword("secret", {
      salt: Buffer.from("0123456789abcdef"),
      keyLength: 32,
    });

    await expect(verifyPasswordHash(passwordHash, "wrong")).resolves.toBe(false);
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
