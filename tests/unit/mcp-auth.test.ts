import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  authenticateMcpBearer,
  createAuthorizationCode,
  exchangeAuthorizationCode,
  type McpAuthRepository,
  type StoredAuthorizationCode,
  type StoredToken,
} from "@/lib/mcp/auth/service";

function challenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

function createMemoryRepository(): McpAuthRepository & {
  codes: Map<string, StoredAuthorizationCode>;
  tokens: Map<string, StoredToken>;
} {
  const codes = new Map<string, StoredAuthorizationCode>();
  const tokens = new Map<string, StoredToken>();
  return {
    codes,
    tokens,
    async saveAuthorizationCode(code) {
      codes.set(code.codeHash, code);
    },
    async consumeAuthorizationCode(codeHash, now) {
      const code = codes.get(codeHash);
      if (!code || code.usedAt || code.expiresAt <= now) return null;
      code.usedAt = now;
      return code;
    },
    async saveAccessToken(token) {
      tokens.set(token.tokenHash, token);
    },
    async findAccessToken(tokenHash) {
      return tokens.get(tokenHash) ?? null;
    },
  };
}

describe("MCP OAuth service", () => {
  it("exchanges a single-use authorization code with an S256 verifier", async () => {
    const repo = createMemoryRepository();
    const now = new Date("2026-07-24T00:00:00.000Z");
    const verifier = "a".repeat(64);
    const code = await createAuthorizationCode(
      {
        clientId: "client_1",
        userId: "user_1",
        redirectUri: "https://chatgpt.com/oauth/callback",
        codeChallenge: challenge(verifier),
      },
      repo,
      { now: () => now, randomToken: () => "authorization-code" },
    );

    const result = await exchangeAuthorizationCode(
      {
        code,
        clientId: "client_1",
        redirectUri: "https://chatgpt.com/oauth/callback",
        codeVerifier: verifier,
      },
      repo,
      {
        allowedUserId: "user_1",
        tokenTtlSeconds: 2_592_000,
        now: () => now,
        randomToken: () => "access-token",
      },
    );

    expect(result).toEqual({
      accessToken: "access-token",
      expiresIn: 2_592_000,
    });
    await expect(
      exchangeAuthorizationCode(
        {
          code,
          clientId: "client_1",
          redirectUri: "https://chatgpt.com/oauth/callback",
          codeVerifier: verifier,
        },
        repo,
        {
          allowedUserId: "user_1",
          tokenTtlSeconds: 2_592_000,
          now: () => now,
          randomToken: () => "second-token",
        },
      ),
    ).rejects.toThrow("authorization_code_invalid");
  });

  it("rejects the wrong PKCE verifier", async () => {
    const repo = createMemoryRepository();
    const now = new Date("2026-07-24T00:00:00.000Z");
    const code = await createAuthorizationCode(
      {
        clientId: "client_1",
        userId: "user_1",
        redirectUri: "https://chatgpt.com/oauth/callback",
        codeChallenge: challenge("a".repeat(64)),
      },
      repo,
      { now: () => now, randomToken: () => "authorization-code" },
    );

    await expect(
      exchangeAuthorizationCode(
        {
          code,
          clientId: "client_1",
          redirectUri: "https://chatgpt.com/oauth/callback",
          codeVerifier: "b".repeat(64),
        },
        repo,
        {
          allowedUserId: "user_1",
          tokenTtlSeconds: 2_592_000,
          now: () => now,
          randomToken: () => "access-token",
        },
      ),
    ).rejects.toThrow("pkce_verification_failed");
  });

  it("rejects authorization for a user other than the configured owner", async () => {
    const repo = createMemoryRepository();
    const now = new Date("2026-07-24T00:00:00.000Z");
    const verifier = "a".repeat(64);
    const code = await createAuthorizationCode(
      {
        clientId: "client_1",
        userId: "user_2",
        redirectUri: "https://chatgpt.com/oauth/callback",
        codeChallenge: challenge(verifier),
      },
      repo,
      { now: () => now, randomToken: () => "authorization-code" },
    );

    await expect(
      exchangeAuthorizationCode(
        {
          code,
          clientId: "client_1",
          redirectUri: "https://chatgpt.com/oauth/callback",
          codeVerifier: verifier,
        },
        repo,
        {
          allowedUserId: "user_1",
          tokenTtlSeconds: 2_592_000,
          now: () => now,
          randomToken: () => "access-token",
        },
      ),
    ).rejects.toThrow("mcp_user_forbidden");
  });

  it("authenticates a valid bearer and rejects expired or revoked tokens", async () => {
    const repo = createMemoryRepository();
    const tokenHash = createHash("sha256").update("valid-token").digest("hex");
    repo.tokens.set(tokenHash, {
      tokenHash,
      clientId: "client_1",
      userId: "user_1",
      expiresAt: new Date("2026-08-01T00:00:00.000Z"),
      revokedAt: null,
    });

    await expect(
      authenticateMcpBearer("Bearer valid-token", repo, {
        allowedUserId: "user_1",
        now: () => new Date("2026-07-24T00:00:00.000Z"),
      }),
    ).resolves.toBe("user_1");
    await expect(
      authenticateMcpBearer("Bearer valid-token", repo, {
        allowedUserId: "user_1",
        now: () => new Date("2026-09-01T00:00:00.000Z"),
      }),
    ).resolves.toBeNull();
    repo.tokens.get(tokenHash)!.revokedAt = new Date("2026-07-25T00:00:00.000Z");
    await expect(
      authenticateMcpBearer("Bearer valid-token", repo, {
        allowedUserId: "user_1",
        now: () => new Date("2026-07-24T00:00:00.000Z"),
      }),
    ).resolves.toBeNull();
  });
});
