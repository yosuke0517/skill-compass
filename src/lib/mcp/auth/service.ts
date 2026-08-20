import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { assertWritesAllowed } from "@/lib/runtime/maintenance";

export type StoredAuthorizationCode = {
  codeHash: string;
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  expiresAt: Date;
  usedAt: Date | null;
};

export type StoredToken = {
  tokenHash: string;
  familyId: string | null;
  clientId: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
};

export type StoredRefreshToken = {
  tokenHash: string;
  familyId: string;
  clientId: string;
  userId: string;
  familyExpiresAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
  replacementTokenHash: string | null;
  revokedAt: Date | null;
};

export type RotateRefreshTokenInput = {
  tokenHash: string;
  clientId: string;
  userId: string;
  now: Date;
  newAccessTokenHash: string;
  newRefreshTokenHash: string;
  accessExpiresAt: Date;
};

export type RotateRefreshTokenResult =
  | { status: "rotated"; familyId: string; familyExpiresAt: Date }
  | { status: "replayed" }
  | { status: "invalid" };

export type McpAuthRepository = {
  saveAuthorizationCode(code: StoredAuthorizationCode): Promise<void>;
  consumeAuthorizationCode(
    codeHash: string,
    now: Date,
  ): Promise<StoredAuthorizationCode | null>;
  saveAccessToken(token: StoredToken): Promise<void>;
  saveTokenPair(
    accessToken: StoredToken,
    refreshToken: StoredRefreshToken,
  ): Promise<void>;
  rotateRefreshToken(
    input: RotateRefreshTokenInput,
  ): Promise<RotateRefreshTokenResult>;
  findAccessToken(tokenHash: string): Promise<StoredToken | null>;
};

type TokenFactory = {
  now?: () => Date;
  randomToken?: () => string;
};

export type IssuedTokenPair = {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshTokenExpiresIn: number;
};

export async function createAuthorizationCode(
  input: {
    clientId: string;
    userId: string;
    redirectUri: string;
    codeChallenge: string;
  },
  repo: McpAuthRepository,
  options: TokenFactory = {},
): Promise<string> {
  assertWritesAllowed("mcp.authorization-code.create");
  const now = options.now?.() ?? new Date();
  const code = options.randomToken?.() ?? randomToken();
  await repo.saveAuthorizationCode({
    codeHash: sha256Hex(code),
    clientId: input.clientId,
    userId: input.userId,
    redirectUri: input.redirectUri,
    codeChallenge: input.codeChallenge,
    expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
    usedAt: null,
  });
  return code;
}

export async function exchangeAuthorizationCode(
  input: {
    code: string;
    clientId: string;
    redirectUri: string;
    codeVerifier: string;
  },
  repo: McpAuthRepository,
  options: TokenFactory & {
    allowedUserId: string;
    accessTokenTtlSeconds: number;
    refreshTokenTtlSeconds: number;
    randomFamilyId?: () => string;
  },
): Promise<IssuedTokenPair> {
  assertWritesAllowed("mcp.authorization-code.exchange");
  const now = options.now?.() ?? new Date();
  const stored = await repo.consumeAuthorizationCode(sha256Hex(input.code), now);
  if (!stored) throw new Error("authorization_code_invalid");
  if (
    stored.clientId !== input.clientId ||
    stored.redirectUri !== input.redirectUri
  ) {
    throw new Error("authorization_code_mismatch");
  }
  if (stored.userId !== options.allowedUserId) {
    throw new Error("mcp_user_forbidden");
  }
  if (!safeEqual(sha256Base64Url(input.codeVerifier), stored.codeChallenge)) {
    throw new Error("pkce_verification_failed");
  }

  const accessToken = options.randomToken?.() ?? randomToken();
  const refreshToken = options.randomToken?.() ?? randomToken();
  const familyId = options.randomFamilyId?.() ?? randomToken();
  const familyExpiresAt = new Date(
    now.getTime() + options.refreshTokenTtlSeconds * 1000,
  );
  await repo.saveTokenPair({
    tokenHash: sha256Hex(accessToken),
    familyId,
    clientId: stored.clientId,
    userId: stored.userId,
    expiresAt: new Date(
      now.getTime() + options.accessTokenTtlSeconds * 1000,
    ),
    revokedAt: null,
  }, {
    tokenHash: sha256Hex(refreshToken),
    familyId,
    clientId: stored.clientId,
    userId: stored.userId,
    familyExpiresAt,
    expiresAt: familyExpiresAt,
    consumedAt: null,
    replacementTokenHash: null,
    revokedAt: null,
  });
  return {
    accessToken,
    expiresIn: options.accessTokenTtlSeconds,
    refreshToken,
    refreshTokenExpiresIn: options.refreshTokenTtlSeconds,
  };
}

export async function exchangeRefreshToken(
  input: { refreshToken: string; clientId: string },
  repo: McpAuthRepository,
  options: TokenFactory & {
    allowedUserId: string;
    accessTokenTtlSeconds: number;
  },
): Promise<IssuedTokenPair> {
  assertWritesAllowed("mcp.refresh-token.exchange");
  const now = options.now?.() ?? new Date();
  const accessToken = options.randomToken?.() ?? randomToken();
  const refreshToken = options.randomToken?.() ?? randomToken();
  const result = await repo.rotateRefreshToken({
    tokenHash: sha256Hex(input.refreshToken),
    clientId: input.clientId,
    userId: options.allowedUserId,
    now,
    newAccessTokenHash: sha256Hex(accessToken),
    newRefreshTokenHash: sha256Hex(refreshToken),
    accessExpiresAt: new Date(
      now.getTime() + options.accessTokenTtlSeconds * 1000,
    ),
  });
  if (result.status === "replayed") throw new Error("refresh_token_replayed");
  if (result.status === "invalid") throw new Error("refresh_token_invalid");
  const refreshTokenExpiresIn = Math.floor(
    (result.familyExpiresAt.getTime() - now.getTime()) / 1000,
  );
  if (refreshTokenExpiresIn <= 0) throw new Error("refresh_token_invalid");
  return {
    accessToken,
    expiresIn: options.accessTokenTtlSeconds,
    refreshToken,
    refreshTokenExpiresIn,
  };
}

export async function authenticateMcpBearer(
  authorization: string | null,
  repo: McpAuthRepository,
  options: { allowedUserId: string; now?: () => Date },
): Promise<string | null> {
  const match = authorization?.match(/^Bearer ([A-Za-z0-9_-]+)$/);
  if (!match) return null;
  const stored = await repo.findAccessToken(sha256Hex(match[1]));
  const now = options.now?.() ?? new Date();
  if (
    !stored ||
    stored.revokedAt !== null ||
    stored.expiresAt <= now ||
    stored.userId !== options.allowedUserId
  ) {
    return null;
  }
  return stored.userId;
}

export function sha256Base64Url(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}
