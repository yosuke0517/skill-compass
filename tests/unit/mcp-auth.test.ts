import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  authenticateMcpBearer,
  createAuthorizationCode,
  exchangeAuthorizationCode,
  exchangeRefreshToken,
  sha256Hex,
  type McpAuthRepository,
  type StoredAuthorizationCode,
  type StoredRefreshToken,
  type StoredToken,
} from "@/lib/mcp/auth/service";

function challenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

function createMemoryRepository(): McpAuthRepository & {
  codes: Map<string, StoredAuthorizationCode>;
  tokens: Map<string, StoredToken>;
  refreshTokens: Map<string, StoredRefreshToken>;
} {
  const codes = new Map<string, StoredAuthorizationCode>();
  const tokens = new Map<string, StoredToken>();
  const refreshTokens = new Map<string, StoredRefreshToken>();
  return {
    codes,
    tokens,
    refreshTokens,
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
    async saveTokenPair(accessToken, refreshToken) {
      tokens.set(accessToken.tokenHash, accessToken);
      refreshTokens.set(refreshToken.tokenHash, refreshToken);
    },
    async rotateRefreshToken(input) {
      const stored = refreshTokens.get(input.tokenHash);
      if (
        !stored ||
        stored.clientId !== input.clientId ||
        stored.userId !== input.userId ||
        stored.revokedAt ||
        stored.expiresAt <= input.now ||
        stored.familyExpiresAt <= input.now
      ) {
        return { status: "invalid" as const };
      }
      if (stored.consumedAt) {
        for (const token of refreshTokens.values()) {
          if (token.familyId === stored.familyId) token.revokedAt = input.now;
        }
        for (const token of tokens.values()) {
          if (token.familyId === stored.familyId) token.revokedAt = input.now;
        }
        return { status: "replayed" as const };
      }
      stored.consumedAt = input.now;
      stored.replacementTokenHash = input.newRefreshTokenHash;
      tokens.set(input.newAccessTokenHash, {
        tokenHash: input.newAccessTokenHash,
        familyId: stored.familyId,
        clientId: stored.clientId,
        userId: stored.userId,
        expiresAt: input.accessExpiresAt,
        revokedAt: null,
      });
      refreshTokens.set(input.newRefreshTokenHash, {
        tokenHash: input.newRefreshTokenHash,
        familyId: stored.familyId,
        clientId: stored.clientId,
        userId: stored.userId,
        familyExpiresAt: stored.familyExpiresAt,
        expiresAt: stored.familyExpiresAt,
        consumedAt: null,
        replacementTokenHash: null,
        revokedAt: null,
      });
      return {
        status: "rotated" as const,
        familyId: stored.familyId,
        familyExpiresAt: stored.familyExpiresAt,
      };
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
        accessTokenTtlSeconds: 3_600,
        refreshTokenTtlSeconds: 15_552_000,
        now: () => now,
        randomToken: sequentialTokens("access-token", "refresh-token"),
        randomFamilyId: () => "family-1",
      },
    );

    expect(result).toEqual({
      accessToken: "access-token",
      expiresIn: 3_600,
      refreshToken: "refresh-token",
      refreshTokenExpiresIn: 15_552_000,
    });
    expect(repo.tokens.get(sha256Hex("access-token"))).toMatchObject({
      familyId: "family-1",
      expiresAt: new Date("2026-07-24T01:00:00.000Z"),
    });
    expect(repo.refreshTokens.get(sha256Hex("refresh-token"))).toMatchObject({
      familyId: "family-1",
      familyExpiresAt: new Date("2027-01-20T00:00:00.000Z"),
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
          accessTokenTtlSeconds: 3_600,
          refreshTokenTtlSeconds: 15_552_000,
          now: () => now,
          randomToken: () => "second-token",
          randomFamilyId: () => "family-2",
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
          accessTokenTtlSeconds: 3_600,
          refreshTokenTtlSeconds: 15_552_000,
          now: () => now,
          randomToken: () => "access-token",
          randomFamilyId: () => "family-1",
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
          accessTokenTtlSeconds: 3_600,
          refreshTokenTtlSeconds: 15_552_000,
          now: () => now,
          randomToken: () => "access-token",
          randomFamilyId: () => "family-1",
        },
      ),
    ).rejects.toThrow("mcp_user_forbidden");
  });

  it("authenticates a valid bearer and rejects expired or revoked tokens", async () => {
    const repo = createMemoryRepository();
    const tokenHash = createHash("sha256").update("valid-token").digest("hex");
    repo.tokens.set(tokenHash, {
      tokenHash,
      familyId: null,
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

  it("rotates refresh tokens without extending the absolute family lifetime", async () => {
    const repo = createMemoryRepository();
    const familyExpiresAt = new Date("2027-01-20T00:00:00.000Z");
    repo.refreshTokens.set(sha256Hex("refresh-token"), {
      tokenHash: sha256Hex("refresh-token"),
      familyId: "family-1",
      clientId: "client_1",
      userId: "user_1",
      familyExpiresAt,
      expiresAt: familyExpiresAt,
      consumedAt: null,
      replacementTokenHash: null,
      revokedAt: null,
    });

    const result = await exchangeRefreshToken(
      { refreshToken: "refresh-token", clientId: "client_1" },
      repo,
      {
        allowedUserId: "user_1",
        accessTokenTtlSeconds: 3_600,
        now: () => new Date("2026-08-24T00:00:00.000Z"),
        randomToken: sequentialTokens("new-access-token", "new-refresh-token"),
      },
    );

    expect(result).toEqual({
      accessToken: "new-access-token",
      expiresIn: 3_600,
      refreshToken: "new-refresh-token",
      refreshTokenExpiresIn: 12_873_600,
    });
    expect(
      repo.refreshTokens.get(sha256Hex("refresh-token"))?.consumedAt,
    ).toEqual(new Date("2026-08-24T00:00:00.000Z"));
    expect(
      repo.refreshTokens.get(sha256Hex("new-refresh-token"))?.familyExpiresAt,
    ).toEqual(familyExpiresAt);
  });

  it("revokes a token family when a consumed refresh token is replayed", async () => {
    const repo = createMemoryRepository();
    const tokenHash = sha256Hex("refresh-token");
    repo.refreshTokens.set(tokenHash, {
      tokenHash,
      familyId: "family-1",
      clientId: "client_1",
      userId: "user_1",
      familyExpiresAt: new Date("2027-01-20T00:00:00.000Z"),
      expiresAt: new Date("2027-01-20T00:00:00.000Z"),
      consumedAt: new Date("2026-08-23T00:00:00.000Z"),
      replacementTokenHash: sha256Hex("replacement"),
      revokedAt: null,
    });
    repo.tokens.set(sha256Hex("access-token"), {
      tokenHash: sha256Hex("access-token"),
      familyId: "family-1",
      clientId: "client_1",
      userId: "user_1",
      expiresAt: new Date("2026-08-24T01:00:00.000Z"),
      revokedAt: null,
    });

    await expect(
      exchangeRefreshToken(
        { refreshToken: "refresh-token", clientId: "client_1" },
        repo,
        {
          allowedUserId: "user_1",
          accessTokenTtlSeconds: 3_600,
          now: () => new Date("2026-08-24T00:00:00.000Z"),
          randomToken: sequentialTokens("unused-access", "unused-refresh"),
        },
      ),
    ).rejects.toThrow("refresh_token_replayed");

    expect(repo.refreshTokens.get(tokenHash)?.revokedAt).toEqual(
      new Date("2026-08-24T00:00:00.000Z"),
    );
    expect(repo.tokens.get(sha256Hex("access-token"))?.revokedAt).toEqual(
      new Date("2026-08-24T00:00:00.000Z"),
    );
  });
});

function sequentialTokens(...tokens: string[]) {
  let index = 0;
  return () => tokens[index++] ?? `token-${index}`;
}
