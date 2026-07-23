import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

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
  clientId: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
};

export type McpAuthRepository = {
  saveAuthorizationCode(code: StoredAuthorizationCode): Promise<void>;
  consumeAuthorizationCode(
    codeHash: string,
    now: Date,
  ): Promise<StoredAuthorizationCode | null>;
  saveAccessToken(token: StoredToken): Promise<void>;
  findAccessToken(tokenHash: string): Promise<StoredToken | null>;
};

type TokenFactory = {
  now?: () => Date;
  randomToken?: () => string;
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
    tokenTtlSeconds: number;
  },
): Promise<{ accessToken: string; expiresIn: number }> {
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
  await repo.saveAccessToken({
    tokenHash: sha256Hex(accessToken),
    clientId: stored.clientId,
    userId: stored.userId,
    expiresAt: new Date(now.getTime() + options.tokenTtlSeconds * 1000),
    revokedAt: null,
  });
  return { accessToken, expiresIn: options.tokenTtlSeconds };
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
