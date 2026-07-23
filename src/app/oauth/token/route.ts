import { getEnv } from "@/lib/env";
import { noStoreJson } from "@/lib/mcp/auth/http";
import { createDrizzleMcpAuthRepository, getMcpOAuthClient } from "@/lib/mcp/auth/repository";
import { exchangeAuthorizationCode } from "@/lib/mcp/auth/service";

export async function POST(request: Request) {
  const env = getEnv();
  if (!env.MCP_ALLOWED_USER_ID) {
    return noStoreJson({ error: "mcp_not_configured" }, { status: 503 });
  }
  const form = await request.formData();
  const grantType = String(form.get("grant_type") ?? "");
  const code = String(form.get("code") ?? "");
  const clientId = String(form.get("client_id") ?? "");
  const redirectUri = String(form.get("redirect_uri") ?? "");
  const codeVerifier = String(form.get("code_verifier") ?? "");
  const client = await getMcpOAuthClient(clientId);
  if (
    grantType !== "authorization_code" ||
    !client ||
    !client.redirectUris.includes(redirectUri)
  ) {
    return noStoreJson({ error: "invalid_grant" }, { status: 400 });
  }
  try {
    const token = await exchangeAuthorizationCode(
      { code, clientId, redirectUri, codeVerifier },
      createDrizzleMcpAuthRepository(),
      {
        allowedUserId: env.MCP_ALLOWED_USER_ID,
        tokenTtlSeconds: env.MCP_ACCESS_TOKEN_TTL_SECONDS,
      },
    );
    return noStoreJson({
      access_token: token.accessToken,
      token_type: "Bearer",
      expires_in: token.expiresIn,
    });
  } catch {
    return noStoreJson({ error: "invalid_grant" }, { status: 400 });
  }
}
