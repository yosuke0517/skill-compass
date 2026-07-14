import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/access/current-user";
import { createOAuthState } from "@/lib/integrations/oauth-state";
import { getEnv } from "@/lib/env";

export async function GET(request: Request) {
  const user = await requireCurrentUser();
  const env = getEnv();
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_REDIRECT_URI) {
    return NextResponse.redirect(new URL("/podcast/settings?oauth=google-not-configured", request.url));
  }
  const state = await createOAuthState({ provider: "google-calendar", userId: user.id, secret: env.SESSION_SECRET });
  const authorize = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorize.searchParams.set("client_id", env.GOOGLE_OAUTH_CLIENT_ID);
  authorize.searchParams.set("redirect_uri", env.GOOGLE_OAUTH_REDIRECT_URI);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", "https://www.googleapis.com/auth/calendar.readonly");
  authorize.searchParams.set("access_type", "offline");
  authorize.searchParams.set("prompt", "consent");
  authorize.searchParams.set("state", state);
  return NextResponse.redirect(authorize);
}
