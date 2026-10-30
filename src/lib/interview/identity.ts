import { createLocalJWKSet, createRemoteJWKSet, jwtVerify, type JSONWebKeySet } from "jose";
import { InterviewError } from "./mock-service";
const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"), {
  timeoutDuration: 3_000,
  cooldownDuration: 30_000,
});
export function createRelayIdentityVerifier(config: {
  audience: string;
  subject: string;
  localKeys?: JSONWebKeySet;
}) {
  // Local keys are passed only by the development-only runtime factory, never request data.
  const keys = config.localKeys ? createLocalJWKSet(config.localKeys) : googleKeys;
  return async (request: Request) => {
    const header = request.headers.get("authorization") ?? "";
    if (!/^Bearer [A-Za-z0-9_.-]{50,8192}$/.test(header))
      throw new InterviewError(401, "中継サーバーを認証できません。");
    try {
      await jwtVerify(header.slice(7), keys, {
        algorithms: ["RS256"],
        issuer: ["https://accounts.google.com", "accounts.google.com"],
        audience: config.audience,
        subject: config.subject,
        requiredClaims: ["exp", "iat", "sub"],
        maxTokenAge: "65m",
        clockTolerance: 5,
      });
    } catch {
      throw new InterviewError(401, "中継サーバーを認証できません。");
    }
  };
}
