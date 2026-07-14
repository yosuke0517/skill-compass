import { NextResponse } from "next/server";

import { getEnv } from "@/lib/env";
import { requireSession } from "@/lib/auth/session";
import { clientSecret, oauthErrorUrl } from "@/lib/integrations/oauth-client";
import { saveOAuthToken } from "@/lib/integrations/oauth-tokens";
import { verifyOAuthState } from "@/lib/integrations/oauth-state";

const verifierCookie = "skill_compass_x_oauth_verifier";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const env = getEnv();
  const redirectUrl = new URL("/podcast/settings", env.PUBLIC_APP_URL ?? request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (url.searchParams.get("error") || !code || !state) return NextResponse.redirect(oauthErrorUrl(redirectUrl.toString(), "x-denied"));
  const verified = await verifyOAuthState(state, getEnv().SESSION_SECRET);
  const session = await requireSession();
  if (!verified || verified.provider !== "x" || verified.userId !== session.userId) return NextResponse.redirect(oauthErrorUrl(redirectUrl.toString(), "invalid-oauth-state"));
  const verifier = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${verifierCookie}=`))?.slice(verifierCookie.length + 1);
  const secret = env.X_OAUTH_CLIENT_SECRET_KEYCHAIN_SERVICE ? await clientSecret(env.X_OAUTH_CLIENT_SECRET_KEYCHAIN_SERVICE)() : undefined;
  if (!env.X_OAUTH_CLIENT_ID || !env.X_OAUTH_REDIRECT_URI || !secret || !verifier) return NextResponse.redirect(oauthErrorUrl(redirectUrl.toString(), "x-credentials-missing"));
  const response = await fetch("https://api.x.com/2/oauth2/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${Buffer.from(`${env.X_OAUTH_CLIENT_ID}:${secret}`).toString("base64")}` }, body: new URLSearchParams({ code, grant_type: "authorization_code", redirect_uri: env.X_OAUTH_REDIRECT_URI, client_id: env.X_OAUTH_CLIENT_ID, code_verifier: verifier }) });
  if (!response.ok) return NextResponse.redirect(oauthErrorUrl(redirectUrl.toString(), "x-token-exchange-failed"));
  const token = await response.json() as { access_token?: string; refresh_token?: string; token_type?: string; scope?: string; expires_in?: number };
  if (!token.access_token) return NextResponse.redirect(oauthErrorUrl(redirectUrl.toString(), "x-token-missing"));
  await saveOAuthToken(session.userId, "x", { accessToken: token.access_token, refreshToken: token.refresh_token, tokenType: token.token_type, scope: token.scope, expiresInSeconds: token.expires_in });
  const responseWithCookie = NextResponse.redirect(new URL("/podcast/settings?oauth=x-connected", request.url));
  responseWithCookie.cookies.delete(verifierCookie);
  return responseWithCookie;
}
