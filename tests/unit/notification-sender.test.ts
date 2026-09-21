// @vitest-environment node
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { describe, it, expect, vi } from "vitest";
import { createPushSender, pushConfiguration } from "@/lib/notifications/sender";

function keyPair() {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = privateKey.export({ format: "jwk" });
  return {
    publicKey: Buffer.concat([
      Buffer.from([4]),
      Buffer.from(jwk.x!, "base64url"),
      Buffer.from(jwk.y!, "base64url"),
    ]).toString("base64url"),
    privateKey: jwk.d!,
  };
}
it("keeps unconfigured deployments disabled", () => {
  expect(pushConfiguration({})).toBeNull();
  expect(
    pushConfiguration({
      VAPID_PUBLIC_KEY: "invalid",
      VAPID_PRIVATE_KEY: "bad",
      VAPID_SUBJECT: "https://example.com",
    }),
  ).toBeNull();
});
describe("encrypted Web Push sender", () => {
  it("sends encrypted aes128gcm with VAPID and never follows redirects", async () => {
    const server = keyPair(),
      client = keyPair();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 201 }));
    const send = createPushSender({ ...server, subject: "https://example.com" }, fetcher);
    const status = await send({
      endpoint: "https://web.push.apple.com/id",
      keys: { p256dh: client.publicKey, auth: randomBytes(16).toString("base64url") },
    });
    expect(status).toBe(201);
    const init = fetcher.mock.calls[0][1]!;
    const headers = new Headers(init.headers);
    expect(headers.get("content-encoding")).toBe("aes128gcm");
    expect(headers.get("authorization")).toMatch(/^vapid /);
    expect(init.redirect).toBe("error");
    expect(init.signal).toBeDefined();
    expect(String(init.body)).not.toContain("Today");
  });
  it("rejects arbitrary destinations before making a request", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const send = createPushSender({ ...keyPair(), subject: "https://example.com" }, fetcher);
    await expect(
      send({ endpoint: "https://localhost/key", keys: { p256dh: "a", auth: "b" } }),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
