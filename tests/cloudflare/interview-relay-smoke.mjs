import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve("wrangler/package.json"));
const { Miniflare } = wranglerRequire("miniflare");
const { build } = wranglerRequire("esbuild");
const root = fileURLToPath(new URL("../../", import.meta.url));
const result = await build({
  stdin: { contents: `export { InterviewRelay } from './src/lib/interview/cloudflare-relay';
    import { routeInterviewRelay } from './src/lib/interview/cloudflare-relay';
    export default { fetch(request, env) { return routeInterviewRelay(request, env); } };`, resolveDir: root },
  absWorkingDir: root, bundle: true, write: false, format: "esm", platform: "node",
  external: ["node:*"], target: "es2022",
});
const mf = new Miniflare({
  modules: true, script: result.outputFiles[0].text,
  compatibilityDate: "2026-04-26", compatibilityFlags: ["nodejs_compat"],
  durableObjects: { INTERVIEW_RELAY: { className: "InterviewRelay", useSQLite: true } },
  d1Databases: ["DB"],
  bindings: { PUBLIC_APP_URL: "https://app.example", INTERVIEW_RELAY_TRANSPORT: "cloudflare",
    INTERVIEW_RELAY_MODE: "openai", OPENAI_API_KEY: "synthetic-never-sent" },
});
try {
  const health = await mf.dispatchFetch("https://app.example/api/interview/health");
  assert.equal(health.status, 200);
  const bad = await mf.dispatchFetch("https://app.example/api/interview/audio", {
    headers: { Upgrade: "websocket", Origin: "https://untrusted.example" },
  });
  assert.equal(bad.status, 403);
  // No auth message: provider construction and outbound API calls cannot occur.
  // Exceed the eight-peer cap cumulatively to prove closed peers are released.
  for (let i = 0; i < 10; i++) {
    const response = await mf.dispatchFetch("https://app.example/api/interview/audio", {
      headers: { Upgrade: "websocket", Origin: "https://app.example" },
    });
    assert.equal(response.status, 101);
    const socket = response.webSocket;
    assert.ok(socket);
    socket.accept();
    socket.close(1000);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  console.log("workerd: health, origin rejection, native 101/accept/close and 10 reconnects passed; no provider authentication");
} finally { await mf.dispose(); }
