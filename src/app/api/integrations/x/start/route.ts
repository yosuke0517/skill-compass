import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/access/current-user";
import { buildXAuthorizeUrl } from "@/lib/integrations/x-oauth";
import { createOAuthState } from "@/lib/integrations/oauth-state";
import { createPkcePair } from "@/lib/integrations/oauth-client";
import { getEnv } from "@/lib/env";

export async function GET(request: Request) {
  const user = await requireCurrentUser();
  const env = getEnv();
  if (!env.X_OAUTH_CLIENT_ID || !env.X_OAUTH_REDIRECT_URI) return NextResponse.redirect(new URL("/podcast/settings?oauth=x-not-configured", request.url));
  const { verifier, challenge } = createPkcePair();
  const state = await createOAuthState({ provider: "x", userId: user.id, secret: env.SESSION_SECRET });
  const authorize = buildXAuthorizeUrl({
    clientId: env.X_OAUTH_CLIENT_ID,
    redirectUri: env.X_OAUTH_REDIRECT_URI,
    state,
    challenge,
  });
  const response = NextResponse.redirect(authorize);
  response.cookies.set("skill_compass_x_oauth_verifier", verifier, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/" });
  return response;
}
