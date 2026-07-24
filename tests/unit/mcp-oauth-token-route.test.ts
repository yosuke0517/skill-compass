import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getMcpOAuthClient: vi.fn(),
  exchangeAuthorizationCode: vi.fn(),
  exchangeRefreshToken: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  getEnv: () => ({
    MCP_ALLOWED_USER_ID: "user_1",
    MCP_ACCESS_TOKEN_TTL_SECONDS: 3_600,
    MCP_REFRESH_TOKEN_TTL_SECONDS: 15_552_000,
  }),
}));
vi.mock("@/lib/mcp/auth/repository", () => ({
  createDrizzleMcpAuthRepository: () => ({ kind: "repository" }),
  getMcpOAuthClient: mocks.getMcpOAuthClient,
}));
vi.mock("@/lib/mcp/auth/service", () => ({
  exchangeAuthorizationCode: mocks.exchangeAuthorizationCode,
  exchangeRefreshToken: mocks.exchangeRefreshToken,
}));

import { POST } from "@/app/oauth/token/route";

describe("MCP OAuth token endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getMcpOAuthClient.mockResolvedValue({
      id: "client_1",
      redirectUris: ["https://chatgpt.com/oauth/callback"],
    });
    mocks.exchangeAuthorizationCode.mockResolvedValue({
      accessToken: "access-token",
      expiresIn: 3_600,
      refreshToken: "refresh-token",
      refreshTokenExpiresIn: 15_552_000,
    });
    mocks.exchangeRefreshToken.mockResolvedValue({
      accessToken: "new-access-token",
      expiresIn: 3_600,
      refreshToken: "new-refresh-token",
      refreshTokenExpiresIn: 12_873_600,
    });
  });

  it("returns a refresh token for an authorization-code exchange", async () => {
    const response = await POST(formRequest({
      grant_type: "authorization_code",
      code: "code",
      client_id: "client_1",
      redirect_uri: "https://chatgpt.com/oauth/callback",
      code_verifier: "a".repeat(64),
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      access_token: "access-token",
      token_type: "Bearer",
      expires_in: 3_600,
      refresh_token: "refresh-token",
      refresh_token_expires_in: 15_552_000,
    });
  });

  it("rotates a refresh token without requiring a redirect URI or verifier", async () => {
    const response = await POST(formRequest({
      grant_type: "refresh_token",
      refresh_token: "refresh-token",
      client_id: "client_1",
    }));

    expect(response.status).toBe(200);
    expect(mocks.exchangeRefreshToken).toHaveBeenCalledWith(
      { refreshToken: "refresh-token", clientId: "client_1" },
      { kind: "repository" },
      expect.objectContaining({
        allowedUserId: "user_1",
        accessTokenTtlSeconds: 3_600,
      }),
    );
    await expect(response.json()).resolves.toEqual({
      access_token: "new-access-token",
      token_type: "Bearer",
      expires_in: 3_600,
      refresh_token: "new-refresh-token",
      refresh_token_expires_in: 12_873_600,
    });
  });

  it("returns OAuth errors without exposing refresh-token failure details", async () => {
    mocks.exchangeRefreshToken.mockRejectedValue(
      new Error("refresh_token_replayed"),
    );
    const response = await POST(formRequest({
      grant_type: "refresh_token",
      refresh_token: "replayed-token",
      client_id: "client_1",
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_grant" });
  });
});

function formRequest(values: Record<string, string>) {
  return new Request("https://agent.finegate.xyz/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(values),
  });
}
