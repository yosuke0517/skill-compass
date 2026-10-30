// @vitest-environment node
import { describe, it, expect } from "vitest";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { createRelayIdentityVerifier } from "@/lib/interview/identity";
describe("Google ID verification with a local signing fixture", () => {
  it("accepts only fixed RS256 issuer/audience/subject and a fresh signed token", async () => {
    const keys = await generateKeyPair("RS256"),
      jwk = { ...(await exportJWK(keys.publicKey)), kid: "test" };
    const verify = createRelayIdentityVerifier({
      audience: "https://app.example/api/interview/relay/redeem",
      subject: "123456",
      localKeys: { keys: [jwk] },
    });
    async function token(overrides: Record<string, unknown> = {}, kid = "test") {
      return new SignJWT({
        iss: "https://accounts.google.com",
        aud: "https://app.example/api/interview/relay/redeem",
        sub: "123456",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
        ...overrides,
      })
        .setProtectedHeader({ alg: "RS256", kid })
        .sign(keys.privateKey);
    }
    const req = (value: string) =>
      new Request("https://app.example", { headers: { authorization: `Bearer ${value}` } });
    await expect(verify(req(await token()))).resolves.toBeUndefined();
    for (const change of [
      { aud: "wrong" },
      { sub: "other" },
      { iss: "https://evil.invalid" },
      { exp: 1 },
      { iat: 1 },
    ])
      await expect(verify(req(await token(change)))).rejects.toMatchObject({ status: 401 });
    await expect(verify(req(await token({}, "unknown")))).rejects.toMatchObject({ status: 401 });
    const signed = await token();
    await expect(verify(req(signed.slice(0, -4) + "abcd"))).rejects.toMatchObject({ status: 401 });
    await expect(verify(new Request("https://app.example"))).rejects.toMatchObject({ status: 401 });
    const hmac = await new SignJWT({ sub: "123456" })
      .setProtectedHeader({ alg: "HS256" })
      .sign(new TextEncoder().encode("fake-test-key-does-not-authorize-anything"));
    await expect(verify(req(hmac))).rejects.toMatchObject({ status: 401 });
  });
});
