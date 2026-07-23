import { and, eq, gt, isNull } from "drizzle-orm";

import { mcpAccessTokens, mcpAuthorizationCodes } from "@/db/schema";
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
    clientId: token.clientId,
    userId: token.userId,
    expiresAt: token.expiresAt,
    revokedAt: token.revokedAt,
  };
}
