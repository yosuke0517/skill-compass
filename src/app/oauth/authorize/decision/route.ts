import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/access/current-user";
import { getEnv } from "@/lib/env";
import { getMcpOAuthClient, createDrizzleMcpAuthRepository } from "@/lib/mcp/auth/repository";
import { createAuthorizationCode } from "@/lib/mcp/auth/service";

export async function POST(request: Request) {
  const user = await requireCurrentUser();
  const env = getEnv();
  if (!env.MCP_ALLOWED_USER_ID || user.id !== env.MCP_ALLOWED_USER_ID) {
    return Response.json({ error: "mcp_user_forbidden" }, { status: 403 });
  }
  const form = await request.formData();
  const clientId = String(form.get("client_id") ?? "");
  const redirectUri = String(form.get("redirect_uri") ?? "");
  const state = String(form.get("state") ?? "");
  const codeChallenge = String(form.get("code_challenge") ?? "");
  const client = await getMcpOAuthClient(clientId);
  if (
    !client ||
    !client.redirectUris.includes(redirectUri) ||
    !state ||
    !/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge)
  ) {
    return Response.json({ error: "invalid_authorization_request" }, { status: 400 });
  }
  const code = await createAuthorizationCode(
    { clientId, userId: user.id, redirectUri, codeChallenge },
    createDrizzleMcpAuthRepository(),
  );
  const redirect = new URL(redirectUri);
  redirect.searchParams.set("code", code);
  redirect.searchParams.set("state", state);
  return NextResponse.redirect(redirect);
}
