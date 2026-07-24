import { describe, expect, it, vi } from "vitest";

import {
  getValidXAccessToken,
  XReconnectRequiredError,
  type XTokenProviderDependencies,
} from "@/lib/x/token-provider";

const now = new Date("2026-07-24T00:00:00.000Z");

function dependencies(
  overrides: Partial<XTokenProviderDependencies> = {},
): XTokenProviderDependencies {
  return {
    now: () => now,
    loadToken: vi.fn().mockResolvedValue({
      accessToken: "current-access",
      refreshToken: "current-refresh",
      tokenType: "Bearer",
      scope: "tweet.read users.read offline.access",
      expiresAt: new Date("2026-07-24T01:00:00.000Z"),
    }),
    saveToken: vi.fn().mockResolvedValue(undefined),
    getClientCredentials: vi.fn().mockResolvedValue({
      clientId: "client-id",
      clientSecret: "client-secret",
    }),
    fetch: vi.fn(),
    ...overrides,
  };
}

describe("getValidXAccessToken", () => {
  it("returns an access token that remains valid beyond the refresh buffer", async () => {
    const deps = dependencies();

    await expect(getValidXAccessToken("user-1", deps)).resolves.toBe(
      "current-access",
    );
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it("refreshes an expiring token and rotates the refresh token", async () => {
    const deps = dependencies({
      loadToken: vi.fn().mockResolvedValue({
        accessToken: "old-access",
        refreshToken: "old-refresh",
        tokenType: "Bearer",
        scope: "tweet.read users.read offline.access",
        expiresAt: new Date("2026-07-24T00:04:00.000Z"),
      }),
      fetch: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: "new-access",
            refresh_token: "new-refresh",
            token_type: "bearer",
            scope: "tweet.read users.read offline.access",
            expires_in: 7200,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    });

    await expect(getValidXAccessToken("user-1", deps)).resolves.toBe(
      "new-access",
    );
    expect(deps.saveToken).toHaveBeenCalledWith("user-1", "x", {
      accessToken: "new-access",
      refreshToken: "new-refresh",
      tokenType: "bearer",
      scope: "tweet.read users.read offline.access",
      expiresInSeconds: 7200,
    });
  });

  it("shares one in-flight refresh across concurrent calls", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "shared-access",
          refresh_token: "shared-refresh",
          expires_in: 7200,
        }),
        { status: 200 },
      ),
    );
    const deps = dependencies({
      loadToken: vi.fn().mockResolvedValue({
        accessToken: "old-access",
        refreshToken: "old-refresh",
        expiresAt: new Date("2026-07-23T00:00:00.000Z"),
      }),
      fetch: fetchMock,
    });

    await expect(
      Promise.all([
        getValidXAccessToken("same-user", deps),
        getValidXAccessToken("same-user", deps),
      ]),
    ).resolves.toEqual(["shared-access", "shared-access"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["missing connection", null],
    [
      "missing refresh token",
      {
        accessToken: "old-access",
        expiresAt: new Date("2026-07-23T00:00:00.000Z"),
      },
    ],
  ])("requires reconnect for %s", async (_label, token) => {
    const deps = dependencies({
      loadToken: vi.fn().mockResolvedValue(token),
    });

    await expect(getValidXAccessToken("user-1", deps)).rejects.toBeInstanceOf(
      XReconnectRequiredError,
    );
  });

  it("requires reconnect without exposing a failed token response", async () => {
    const deps = dependencies({
      loadToken: vi.fn().mockResolvedValue({
        accessToken: "old-access",
        refreshToken: "secret-refresh-token",
        expiresAt: new Date("2026-07-23T00:00:00.000Z"),
      }),
      fetch: vi.fn().mockResolvedValue(
        new Response('{"error":"invalid_grant","secret":"do-not-leak"}', {
          status: 400,
        }),
      ),
    });

    await expect(getValidXAccessToken("user-1", deps)).rejects.toEqual(
      new XReconnectRequiredError(),
    );
  });
});
