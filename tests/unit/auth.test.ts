// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateUser: vi.fn(),
  cookieStore: { set: vi.fn(), delete: vi.fn() },
  cookies: vi.fn(),
  redirect: vi.fn((path: string): never => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth/users", () => ({ authenticateUser: mocks.authenticateUser }));

import { loginAction } from "@/app/actions/auth";
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
    const session = await createSessionToken("12345678901234567890123456789012", now, {
      id: "user_test",
      email: "test@example.com",
    });
    const verified = await verifySessionToken(
      session.token,
      "12345678901234567890123456789012",
      now,
    );

    expect(verified).toMatchObject({ authenticated: true, userId: "user_test", email: "test@example.com" });
    expect(session.expiresAt.toISOString()).toBe("2026-07-09T00:00:00.000Z");
  });
});

describe("loginAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DATABASE_URL", "mysql://user:password@localhost:3306/skill_compass");
    vi.stubEnv("SESSION_SECRET", "12345678901234567890123456789012");
    mocks.cookies.mockResolvedValue(mocks.cookieStore);
  });

  it("keeps a safe return path when credentials are invalid", async () => {
    mocks.authenticateUser.mockResolvedValue(undefined);
    const formData = new FormData();
    formData.set("email", "person@example.com");
    formData.set("password", "wrong-password");
    formData.set("next", "/docs/cloud-migration?from=chat");

    await expect(loginAction(formData)).rejects.toThrow(
      "redirect:/login?error=invalid&next=%2Fdocs%2Fcloud-migration%3Ffrom%3Dchat",
    );

    expect(mocks.redirect).toHaveBeenCalledWith(
      "/login?error=invalid&next=%2Fdocs%2Fcloud-migration%3Ffrom%3Dchat",
    );
    expect(mocks.cookieStore.set).not.toHaveBeenCalled();
  });

  it("redirects a successful login to its safe return path after setting the session cookie", async () => {
    mocks.authenticateUser.mockResolvedValue({ id: "user_1", email: "person@example.com" });
    const formData = new FormData();
    formData.set("email", "person@example.com");
    formData.set("password", "correct-password");
    formData.set("next", "/docs/cloud-migration?from=chat");

    await expect(loginAction(formData)).rejects.toThrow(
      "redirect:/docs/cloud-migration?from=chat",
    );

    expect(mocks.cookieStore.set).toHaveBeenCalledOnce();
    expect(mocks.redirect).toHaveBeenCalledWith("/docs/cloud-migration?from=chat");
  });
});
