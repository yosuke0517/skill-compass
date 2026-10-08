import { test } from "node:test";
import assert from "node:assert/strict";
import { IdTokens, WorkerAuthority } from "../src/authority.js";
import { VertexHints, boundedContext } from "../src/adapters/hints.js";
import { hintInstruction } from "../src/shared.js";
test("server identity refresh is automatic, shared, and happens before expiry", async () => {
  let now = 100000,
    calls = 0;
  const tokens = new IdTokens(
    async () => {
      calls++;
      return (
        "header." +
        Buffer.from(JSON.stringify({ exp: (now + 3600000) / 1000 })).toString("base64url") +
        ".sig"
      );
    },
    () => now,
  );
  await Promise.all([tokens.get(), tokens.get(), tokens.get()]);
  assert.equal(calls, 1);
  now += 3500000;
  await tokens.get();
  assert.equal(calls, 1);
  now += 50000;
  await tokens.get();
  assert.equal(calls, 2);
});
test("Worker callback uses fixed endpoint and Bearer; rejects redirect and non-success", async () => {
  const tokens = new IdTokens(
    async () =>
      "h." +
      Buffer.from(JSON.stringify({ exp: Date.now() / 1000 + 3600 })).toString("base64url") +
      ".s",
  );
  const a = new WorkerAuthority("https://app.example/api/interview/relay/redeem", tokens, (async (
    url,
    options,
  ) => {
    assert.equal(url, "https://app.example/api/interview/relay/lease");
    assert.equal(options?.redirect, "error");
    assert.ok((options?.headers as Record<string, string>).authorization.startsWith("Bearer "));
    return new Response("{}", { status: 403 });
  }) as typeof fetch);
  await assert.rejects(a.call("lease", {}, new AbortController().signal));
});
test("Vertex request bounds context, disables tool use and ignores thought output", async () => {
  const turns = Array.from({ length: 20 }, () => ({
    source: "interviewer" as const,
    text: "長い質問".repeat(500),
  }));
  assert.ok(Buffer.byteLength(hintInstruction + JSON.stringify(boundedContext(turns))) <= 1800);
  const vertex = new VertexHints(
    "test-project",
    "gemini-3.1-flash-lite",
    async () => "local-fake",
    (async (url, options) => {
      assert.match(String(url), /^https:\/\/aiplatform.googleapis.com\/v1\/projects\/test-project/);
      const body = JSON.parse(String(options?.body));
      assert.equal(body.generationConfig.maxOutputTokens, 512);
      assert.equal(body.tools, undefined);
      assert.match(body.systemInstruction.parts[0].text, /創作/);
      return Response.json({
        candidates: [
          {
            content: {
              parts: [
                { thought: true, text: "private reasoning" },
                { text: "観点を確認\n実体験を選ぶ" },
              ],
            },
          },
        ],
      });
    }) as typeof fetch,
  );
  assert.deepEqual(await vertex.generate(turns, new AbortController().signal), [
    "観点を確認",
    "実体験を選ぶ",
  ]);
});
