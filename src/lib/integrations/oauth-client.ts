import { createHash, randomBytes } from "node:crypto";

import { isCloudflareWorkersRuntime } from "@/lib/runtime/cloudflare";

export function createPkcePair() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function clientSecret(service: string) {
  return async () => {
    if (isCloudflareWorkersRuntime()) return undefined;

    const { createKeychainSecretResolver } = await import("@/lib/secrets/keychain");
    return createKeychainSecretResolver({ service })();
  };
}

export function oauthErrorUrl(base: string, error: string) {
  const url = new URL(base);
  url.searchParams.set("oauth", error);
  return url;
}
