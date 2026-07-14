import { NextResponse } from "next/server";

import { getEnv } from "@/lib/env";
import { requireSession } from "@/lib/auth/session";
import { clientSecret, oauthErrorUrl } from "@/lib/integrations/oauth-client";
import { saveOAuthToken } from "@/lib/integrations/oauth-tokens";
import { verifyOAuthState } from "@/lib/integrations/oauth-state";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const env = getEnv();
  const redirectUrl = new URL("/podcast/settings", env.PUBLIC_APP_URL ?? request.url);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (error || !code || !state) return NextResponse.redirect(oauthErrorUrl(redirectUrl.toString(), "google-denied"));
  const verified = await verifyOAuthState(state, getEnv().SESSION_SECRET);
  const session = await requireSession();
  if (!verified || verified.provider !== "google-calendar" || verified.userId !== session.userId) return NextResponse.redirect(oauthErrorUrl(redirectUrl.toString(), "invalid-oauth-state"));
  const secret = env.GOOGLE_OAUTH_CLIENT_SECRET_KEYCHAIN_SERVICE ? await clientSecret(env.GOOGLE_OAUTH_CLIENT_SECRET_KEYCHAIN_SERVICE)() : undefined;
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_REDIRECT_URI || !secret) return NextResponse.redirect(oauthErrorUrl(redirectUrl.toString(), "google-secret-missing"));
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: env.GOOGLE_OAUTH_CLIENT_ID, client_secret: secret, redirect_uri: env.GOOGLE_OAUTH_REDIRECT_URI, grant_type: "authorization_code" }) });
  if (!response.ok) return NextResponse.redirect(oauthErrorUrl(redirectUrl.toString(), "google-token-exchange-failed"));
  const token = await response.json() as { access_token?: string; refresh_token?: string; token_type?: string; scope?: string; expires_in?: number };
  if (!token.access_token) return NextResponse.redirect(oauthErrorUrl(redirectUrl.toString(), "google-token-missing"));
  await saveOAuthToken(session.userId, "google-calendar", { accessToken: token.access_token, refreshToken: token.refresh_token, tokenType: token.token_type, scope: token.scope, expiresInSeconds: token.expires_in });
  redirectUrl.searchParams.set("oauth", "google-connected");
  return NextResponse.redirect(redirectUrl);
}
