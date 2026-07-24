import { getEnv } from "@/lib/env";
import { clientSecret } from "@/lib/integrations/oauth-client";

type StoredXToken = {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  scope?: string;
  expiresAt: Date | null;
} | null;

type SavedXToken = {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  scope?: string;
  expiresInSeconds?: number;
};

type RefreshedXToken = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
};

export type XTokenProviderDependencies = {
  now: () => Date;
  loadToken: (userId: string, provider: "x") => Promise<StoredXToken>;
  saveToken: (
    userId: string,
    provider: "x",
    token: SavedXToken,
  ) => Promise<void>;
  getClientCredentials: () => Promise<{
    clientId: string;
    clientSecret: string;
  } | null>;
  fetch: typeof fetch;
};

export class XReconnectRequiredError extends Error {
  readonly code = "x_reconnect_required";

  constructor() {
    super("x_reconnect_required");
    this.name = "XReconnectRequiredError";
  }
}

const refreshBufferMs = 5 * 60 * 1000;
const refreshesInFlight = new Map<string, Promise<string>>();

async function defaultClientCredentials() {
  const env = getEnv();
  if (!env.X_OAUTH_CLIENT_ID || !env.X_OAUTH_CLIENT_SECRET_KEYCHAIN_SERVICE) {
    return null;
  }
  const secret = await clientSecret(
    env.X_OAUTH_CLIENT_SECRET_KEYCHAIN_SERVICE,
  )();
  return secret
    ? { clientId: env.X_OAUTH_CLIENT_ID, clientSecret: secret }
    : null;
}

const defaultDependencies: XTokenProviderDependencies = {
  now: () => new Date(),
  loadToken: async (userId, provider) => {
    const { getOAuthToken } = await import("@/lib/integrations/oauth-tokens");
    return getOAuthToken(userId, provider);
  },
  saveToken: async (userId, provider, token) => {
    const { saveOAuthToken } = await import("@/lib/integrations/oauth-tokens");
    await saveOAuthToken(userId, provider, token);
  },
  getClientCredentials: defaultClientCredentials,
  fetch,
};

export async function getValidXAccessToken(
  userId: string,
  dependencies: XTokenProviderDependencies = defaultDependencies,
) {
  const stored = await dependencies.loadToken(userId, "x");
  if (!stored) throw new XReconnectRequiredError();

  const refreshAfter = dependencies.now().getTime() + refreshBufferMs;
  if (!stored.expiresAt || stored.expiresAt.getTime() > refreshAfter) {
    return stored.accessToken;
  }
  if (!stored.refreshToken) throw new XReconnectRequiredError();

  const existingRefresh = refreshesInFlight.get(userId);
  if (existingRefresh) return existingRefresh;
  const refresh = refreshXAccessToken(
    userId,
    { ...stored, refreshToken: stored.refreshToken },
    dependencies,
  );
  refreshesInFlight.set(userId, refresh);
  try {
    return await refresh;
  } finally {
    if (refreshesInFlight.get(userId) === refresh) {
      refreshesInFlight.delete(userId);
    }
  }
}

async function refreshXAccessToken(
  userId: string,
  stored: Exclude<StoredXToken, null> & { refreshToken: string },
  dependencies: XTokenProviderDependencies,
) {
  const credentials = await dependencies.getClientCredentials();
  if (!credentials) throw new XReconnectRequiredError();

  let response: Response;
  try {
    response = await dependencies.fetch("https://api.x.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: `Basic ${Buffer.from(
          `${credentials.clientId}:${credentials.clientSecret}`,
        ).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: stored.refreshToken,
        client_id: credentials.clientId,
      }),
    });
  } catch {
    throw new XReconnectRequiredError();
  }
  if (!response.ok) throw new XReconnectRequiredError();

  let refreshed: RefreshedXToken;
  try {
    refreshed = (await response.json()) as RefreshedXToken;
  } catch {
    throw new XReconnectRequiredError();
  }
  if (!refreshed.access_token) throw new XReconnectRequiredError();

  await dependencies.saveToken(userId, "x", {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token ?? stored.refreshToken,
    tokenType: refreshed.token_type ?? stored.tokenType,
    scope: refreshed.scope ?? stored.scope,
    expiresInSeconds: refreshed.expires_in,
  });
  return refreshed.access_token;
}
