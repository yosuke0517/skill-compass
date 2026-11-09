import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { oauthConnections } from "@/db/schema";
import { db } from "@/db/client";
import { getEnv } from "@/lib/env";
import { assertWritesAllowed } from "@/lib/runtime/maintenance";

type OAuthToken = {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  scope?: string;
  expiresInSeconds?: number;
};

export async function saveOAuthToken(userId: string, provider: "google-calendar" | "x", token: OAuthToken) {
  assertWritesAllowed("oauth.token.save");
  const now = new Date();
  await db.insert(oauthConnections).values({
    id: `oauth_${randomUUID()}`,
    userId,
    provider,
    accessTokenCiphertext: encrypt(token.accessToken),
    refreshTokenCiphertext: token.refreshToken ? encrypt(token.refreshToken) : null,
    tokenType: token.tokenType ?? "Bearer",
    scope: token.scope ?? null,
    expiresAt: token.expiresInSeconds ? new Date(now.getTime() + token.expiresInSeconds * 1000) : null,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: [oauthConnections.userId, oauthConnections.provider],
    set: {
      accessTokenCiphertext: encrypt(token.accessToken),
      refreshTokenCiphertext: token.refreshToken ? encrypt(token.refreshToken) : undefined,
      tokenType: token.tokenType ?? "Bearer",
      scope: token.scope ?? null,
      expiresAt: token.expiresInSeconds ? new Date(now.getTime() + token.expiresInSeconds * 1000) : null,
      updatedAt: now,
    },
  });
}

export async function getOAuthToken(userId: string, provider: "google-calendar" | "x") {
  const [connection] = await db.select().from(oauthConnections).where(and(eq(oauthConnections.userId, userId), eq(oauthConnections.provider, provider))).limit(1);
  if (!connection) return null;
  return {
    accessToken: decrypt(connection.accessTokenCiphertext),
    refreshToken: connection.refreshTokenCiphertext ? decrypt(connection.refreshTokenCiphertext) : undefined,
    tokenType: connection.tokenType ?? "Bearer",
    scope: connection.scope ?? undefined,
    expiresAt: connection.expiresAt,
  };
}

export function effectiveOAuthTokenSecret(input: {
  oauthTokenEncryptionSecret?: string;
  sessionSecret: string;
}) {
  return input.oauthTokenEncryptionSecret ?? input.sessionSecret;
}

export function sealOAuthToken(value: string, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", oauthTokenKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${ciphertext.toString("base64url")}`;
}

export function openOAuthToken(value: string, secret: string) {
  const [version, encodedIv, encodedTag, encodedCiphertext] = value.split(":");
  if (version !== "v1" || !encodedIv || !encodedTag || !encodedCiphertext) {
    throw new Error("Invalid OAuth token ciphertext");
  }
  const decipher = createDecipheriv("aes-256-gcm", oauthTokenKey(secret), Buffer.from(encodedIv, "base64url"));
  decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function oauthTokenKey(secret: string) {
  return createHash("sha256").update(secret).digest();
}

function encrypt(value: string) {
  return sealOAuthToken(value, effectiveOAuthTokenSecret({
    oauthTokenEncryptionSecret: getEnv().OAUTH_TOKEN_ENCRYPTION_SECRET,
    sessionSecret: getEnv().SESSION_SECRET,
  }));
}

function decrypt(value: string) {
  return openOAuthToken(value, effectiveOAuthTokenSecret({
    oauthTokenEncryptionSecret: getEnv().OAUTH_TOKEN_ENCRYPTION_SECRET,
    sessionSecret: getEnv().SESSION_SECRET,
  }));
}
