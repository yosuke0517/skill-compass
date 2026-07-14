import { jwtVerify, SignJWT } from "jose";

export type OAuthProvider = "google-calendar" | "x";

export async function createOAuthState(input: { provider: OAuthProvider; userId: string; secret: string; now?: Date; ttlSeconds?: number }): Promise<string> {
  const now = input.now ?? new Date();
  const issuedAt = Math.floor(now.getTime() / 1000);
  return new SignJWT({ purpose: "skill-compass-oauth-state", provider: input.provider, userId: input.userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + (input.ttlSeconds ?? 600))
    .sign(secretBytes(input.secret));
}

export async function verifyOAuthState(token: string, secret: string, now = new Date()): Promise<{ provider: OAuthProvider; userId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secretBytes(secret), { currentDate: now });
    if (payload.purpose !== "skill-compass-oauth-state" || (payload.provider !== "google-calendar" && payload.provider !== "x") || typeof payload.userId !== "string") return null;
    return { provider: payload.provider, userId: payload.userId };
  } catch {
    return null;
  }
}

function secretBytes(secret: string): Uint8Array {
  return new Uint8Array(Buffer.from(secret, "utf8"));
}
