import { describe, expect, it } from "vitest";

import { resolveRuntimeSecret } from "@/lib/runtime/bindings";

describe("Worker runtime bindings", () => {
  it("reads named secrets from Cloudflare bindings", () => {
    expect(
      resolveRuntimeSecret("SESSION_SECRET", {
        cloudflare: true,
        bindings: { SESSION_SECRET: "worker-session-secret" },
      }),
    ).toBe("worker-session-secret");
  });

  it("fails closed with the missing binding name but never another value", () => {
    expect(() =>
      resolveRuntimeSecret("X_OAUTH_CLIENT_SECRET", {
        cloudflare: true,
        bindings: { SESSION_SECRET: "must-not-appear" },
      }),
    ).toThrow("Missing Cloudflare secret: X_OAUTH_CLIENT_SECRET");

    try {
      resolveRuntimeSecret("X_OAUTH_CLIENT_SECRET", {
        cloudflare: true,
        bindings: { SESSION_SECRET: "must-not-appear" },
      });
    } catch (error) {
      expect(String(error)).not.toContain("must-not-appear");
    }
  });
});
