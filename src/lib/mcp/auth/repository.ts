import { and, eq, gt, isNull } from "drizzle-orm";

import {
  mcpAccessTokens,
  mcpAuthorizationCodes,
  mcpRefreshTokens,
} from "@/db/schema";
import { mcpOauthClients } from "@/db/schema";
import type {
  McpAuthRepository,
  StoredAuthorizationCode,
  StoredToken,
} from "./service";

export function createDrizzleMcpAuthRepository(): McpAuthRepository {
  return {
    async saveAuthorizationCode(code) {
      const { db } = await import("@/db/client");
      await db.insert(mcpAuthorizationCodes).values(code);
    },
    async consumeAuthorizationCode(codeHash, now) {
      const { db } = await import("@/db/client");
      return db.transaction(async (tx) => {
        const [code] = await tx
          .select()
          .from(mcpAuthorizationCodes)
          .where(
            and(
              eq(mcpAuthorizationCodes.codeHash, codeHash),
              isNull(mcpAuthorizationCodes.usedAt),
              gt(mcpAuthorizationCodes.expiresAt, now),
            ),
          )
          .limit(1)
          .for("update");
        if (!code) return null;
        await tx
          .update(mcpAuthorizationCodes)
          .set({ usedAt: now })
          .where(
            and(
              eq(mcpAuthorizationCodes.codeHash, codeHash),
              isNull(mcpAuthorizationCodes.usedAt),
            ),
          );
        return toStoredCode(code, now);
      });
    },
    async saveAccessToken(token) {
      const { db } = await import("@/db/client");
      await db.insert(mcpAccessTokens).values(token);
    },
    async saveTokenPair(accessToken, refreshToken) {
      const { db } = await import("@/db/client");
      await db.transaction(async (tx) => {
        await tx.insert(mcpAccessTokens).values(accessToken);
        await tx.insert(mcpRefreshTokens).values(refreshToken);
      });
    },
    async rotateRefreshToken(input) {
      const { db } = await import("@/db/client");
      return db.transaction(async (tx) => {
        const [stored] = await tx
          .select()
          .from(mcpRefreshTokens)
          .where(eq(mcpRefreshTokens.tokenHash, input.tokenHash))
          .limit(1)
          .for("update");
        if (
          !stored ||
          stored.clientId !== input.clientId ||
          stored.userId !== input.userId ||
          stored.revokedAt !== null ||
          stored.expiresAt <= input.now ||
          stored.familyExpiresAt <= input.now
        ) {
          return { status: "invalid" as const };
        }
        if (stored.consumedAt !== null) {
          await tx
            .update(mcpRefreshTokens)
            .set({ revokedAt: input.now })
            .where(eq(mcpRefreshTokens.familyId, stored.familyId));
          await tx
            .update(mcpAccessTokens)
            .set({ revokedAt: input.now })
            .where(eq(mcpAccessTokens.familyId, stored.familyId));
          return { status: "replayed" as const };
        }
        await tx
          .update(mcpRefreshTokens)
          .set({
            consumedAt: input.now,
            replacementTokenHash: input.newRefreshTokenHash,
          })
          .where(
            and(
              eq(mcpRefreshTokens.tokenHash, input.tokenHash),
              isNull(mcpRefreshTokens.consumedAt),
            ),
          );
        await tx.insert(mcpAccessTokens).values({
          tokenHash: input.newAccessTokenHash,
          familyId: stored.familyId,
          clientId: stored.clientId,
          userId: stored.userId,
          expiresAt: input.accessExpiresAt,
          revokedAt: null,
        });
        await tx.insert(mcpRefreshTokens).values({
          tokenHash: input.newRefreshTokenHash,
          familyId: stored.familyId,
          clientId: stored.clientId,
          userId: stored.userId,
          familyExpiresAt: stored.familyExpiresAt,
          expiresAt: stored.familyExpiresAt,
          consumedAt: null,
          replacementTokenHash: null,
          revokedAt: null,
        });
        return {
          status: "rotated" as const,
          familyId: stored.familyId,
          familyExpiresAt: stored.familyExpiresAt,
        };
      });
    },
    async findAccessToken(tokenHash) {
      const { db } = await import("@/db/client");
      const [token] = await db
        .select()
        .from(mcpAccessTokens)
        .where(eq(mcpAccessTokens.tokenHash, tokenHash))
        .limit(1);
      return token ? toStoredToken(token) : null;
    },
  };
}

export async function saveMcpOAuthClient(input: {
  id: string;
  redirectUris: string[];
  clientName: string;
}) {
  const { db } = await import("@/db/client");
  await db.insert(mcpOauthClients).values(input);
}

export async function getMcpOAuthClient(clientId: string) {
  const { db } = await import("@/db/client");
  const [client] = await db
    .select()
    .from(mcpOauthClients)
    .where(eq(mcpOauthClients.id, clientId))
    .limit(1);
  return client ?? null;
}

function toStoredCode(
  code: typeof mcpAuthorizationCodes.$inferSelect,
  usedAt: Date,
): StoredAuthorizationCode {
  return {
    codeHash: code.codeHash,
    clientId: code.clientId,
    userId: code.userId,
    redirectUri: code.redirectUri,
    codeChallenge: code.codeChallenge,
    expiresAt: code.expiresAt,
    usedAt,
  };
}

function toStoredToken(token: typeof mcpAccessTokens.$inferSelect): StoredToken {
  return {
    tokenHash: token.tokenHash,
    familyId: token.familyId,
    clientId: token.clientId,
    userId: token.userId,
    expiresAt: token.expiresAt,
    revokedAt: token.revokedAt,
  };
}
