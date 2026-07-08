import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getEnv } from "@/lib/env";

export const SESSION_COOKIE_NAME = "skill_compass_session";
export const SESSION_DURATION_SECONDS = 24 * 60 * 60;

export type SessionState =
  | {
      authenticated: true;
      expiresAt: Date;
    }
  | {
      authenticated: false;
    };

function sessionKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(secret = getEnv().SESSION_SECRET, now = new Date()) {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_SECONDS * 1000);
  const expiresAtSeconds = Math.floor(expiresAt.getTime() / 1000);
  const token = await new SignJWT({ purpose: "skill-compass-session" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAtSeconds)
    .sign(sessionKey(secret));

  return { token, expiresAt };
}

export async function verifySessionToken(
  token: string | undefined,
  secret = getEnv().SESSION_SECRET,
  now = new Date(),
): Promise<SessionState> {
  if (!token) return { authenticated: false };

  try {
    const { payload } = await jwtVerify(token, sessionKey(secret), { currentDate: now });
    if (payload.purpose !== "skill-compass-session" || typeof payload.exp !== "number") {
      return { authenticated: false };
    }

    return { authenticated: true, expiresAt: new Date(payload.exp * 1000) };
  } catch {
    return { authenticated: false };
  }
}

export async function getSession(): Promise<SessionState> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return verifySessionToken(token);
}

export async function requireSession(): Promise<Extract<SessionState, { authenticated: true }>> {
  const session = await getSession();
  if (!session.authenticated) redirect("/login");
  return session;
}
