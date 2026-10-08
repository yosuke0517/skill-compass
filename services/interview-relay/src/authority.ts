import { GoogleAuth } from "google-auth-library";
import { createSign } from "node:crypto";
export type Grant = {
  id: string;
  owner: string;
  generation: number;
  nonce: string;
  expiresAt: number;
  leaseUntil: number;
  mode: "mock" | "google";
};
export interface Authority {
  call(
    operation: "redeem" | "lease" | "hint" | "release",
    input: object,
    signal: AbortSignal,
  ): Promise<Grant>;
}
export class IdTokens {
  private cached?: { token: string; expires: number };
  private pending?: Promise<string>;
  constructor(
    private fetchToken: () => Promise<string>,
    private now = Date.now,
  ) {}
  async get() {
    if (this.cached && this.cached.expires - this.now() > 60_000) return this.cached.token;
    if (this.pending) return this.pending;
    this.pending = this.fetchToken()
      .then((token) => {
        const { exp } = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString());
        if (!Number.isFinite(exp) || exp * 1000 <= this.now() + 60_000)
          throw new Error("Identity expired");
        this.cached = { token, expires: exp * 1000 };
        return token;
      })
      .finally(() => {
        this.pending = undefined;
      });
    return this.pending;
  }
}
export function googleTokens(audience: string) {
  const auth = new GoogleAuth();
  return new IdTokens(async () => {
    const client = await auth.getIdTokenClient(audience);
    return client.idTokenProvider.fetchIdToken(audience);
  });
}
/** Explicit local test issuer. Never selected by a production/Google runtime. */
export function localTokens(audience: string, subject: string, key: string) {
  return new IdTokens(async () => {
    const header = Buffer.from(
      JSON.stringify({ alg: "RS256", kid: "local-interview-test", typ: "JWT" }),
    ).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const body = Buffer.from(
      JSON.stringify({
        iss: "https://accounts.google.com",
        aud: audience,
        sub: subject,
        iat: now,
        exp: now + 3600,
      }),
    ).toString("base64url");
    const value = header + "." + body;
    return value + "." + createSign("RSA-SHA256").update(value).sign(key, "base64url");
  });
}
export class WorkerAuthority implements Authority {
  constructor(
    private audience: string,
    private tokens: IdTokens,
    private request: typeof fetch = fetch,
  ) {}
  async call(
    operation: "redeem" | "lease" | "hint" | "release",
    input: object,
    signal: AbortSignal,
  ) {
    const token = await this.tokens.get();
    signal.throwIfAborted();
    const response = await this.request(this.audience.replace(/redeem$/, operation), {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(4_000)]),
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    });
    if (!response.ok)
      throw new Error("利用許可を確認できません。停止または利用枠を確認してください。");
    const value = (await response.json()) as Grant;
    if (operation === "release") return value;
    if (
      typeof value.id !== "string" ||
      typeof value.owner !== "string" ||
      !Number.isSafeInteger(value.generation) ||
      typeof value.nonce !== "string" ||
      !Number.isFinite(value.expiresAt) ||
      !Number.isFinite(value.leaseUntil) ||
      !["mock", "google"].includes(value.mode)
    )
      throw new Error("Invalid authority reply");
    return value;
  }
}
