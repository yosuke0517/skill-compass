import { getEnv } from "@/lib/env";
import { noStoreJson } from "@/lib/mcp/auth/http";
import { createDrizzleMcpAuthRepository, getMcpOAuthClient } from "@/lib/mcp/auth/repository";
import {
  exchangeAuthorizationCode,
  exchangeRefreshToken,
  type IssuedTokenPair,
} from "@/lib/mcp/auth/service";

export async function POST(request: Request) {
  const env = getEnv();
  if (!env.MCP_ALLOWED_USER_ID) {
    return noStoreJson({ error: "mcp_not_configured" }, { status: 503 });
  }
  const form = await request.formData();
  const grantType = String(form.get("grant_type") ?? "");
  const clientId = String(form.get("client_id") ?? "");
  const client = await getMcpOAuthClient(clientId);
  if (!client) {
    return noStoreJson({ error: "invalid_client" }, { status: 400 });
  }
  try {
    const repo = createDrizzleMcpAuthRepository();
    let token: IssuedTokenPair;
    if (grantType === "authorization_code") {
      const redirectUri = String(form.get("redirect_uri") ?? "");
      if (!client.redirectUris.includes(redirectUri)) {
        return noStoreJson({ error: "invalid_grant" }, { status: 400 });
      }
      token = await exchangeAuthorizationCode(
        {
          code: String(form.get("code") ?? ""),
          clientId,
          redirectUri,
          codeVerifier: String(form.get("code_verifier") ?? ""),
        },
        repo,
        {
          allowedUserId: env.MCP_ALLOWED_USER_ID,
          accessTokenTtlSeconds: env.MCP_ACCESS_TOKEN_TTL_SECONDS,
          refreshTokenTtlSeconds: env.MCP_REFRESH_TOKEN_TTL_SECONDS,
        },
      );
    } else if (grantType === "refresh_token") {
      token = await exchangeRefreshToken(
        {
          refreshToken: String(form.get("refresh_token") ?? ""),
          clientId,
        },
        repo,
        {
          allowedUserId: env.MCP_ALLOWED_USER_ID,
          accessTokenTtlSeconds: env.MCP_ACCESS_TOKEN_TTL_SECONDS,
        },
      );
    } else {
      return noStoreJson(
        { error: "unsupported_grant_type" },
        { status: 400 },
      );
    }
    return tokenResponse(token);
  } catch {
    return noStoreJson({ error: "invalid_grant" }, { status: 400 });
  }
}

function tokenResponse(token: IssuedTokenPair) {
  return noStoreJson({
    access_token: token.accessToken,
    token_type: "Bearer",
    expires_in: token.expiresIn,
    refresh_token: token.refreshToken,
    refresh_token_expires_in: token.refreshTokenExpiresIn,
  });
}
