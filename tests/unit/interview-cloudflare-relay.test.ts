// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InterviewRelay, routeInterviewRelay } from "@/lib/interview/cloudflare-relay";
import { createCloudflareRelayService } from "@/lib/interview/cloudflare-service";
import { interviewD1 } from "../helpers/interview-d1";

class Socket extends EventTarget {
  readyState = 1;
  sent: Record<string, unknown>[] = [];
  accept() {}
  send(data: string) { this.sent.push(JSON.parse(data)); }
  close() { if (this.readyState === 3) return; this.readyState = 3; this.dispatchEvent(new Event("close")); }
  message(data: string | ArrayBuffer) { this.dispatchEvent(new MessageEvent("message", { data })); }
}
const pairs: { client: Socket; server: Socket }[] = [];
const NativeResponse = Response;
class UpgradeResponse extends NativeResponse {
  readonly webSocket?: Socket;
  constructor(body?: BodyInit | null, init?: ResponseInit & { webSocket?: Socket }) {
    super(body, init?.status === 101 ? { ...init, status: 200 } : init);
    if (init?.status === 101) Object.defineProperty(this, "status", { value: 101 });
    this.webSocket = init?.webSocket;
  }
}
const config = { INTERVIEW_RELAY_TRANSPORT: "cloudflare", INTERVIEW_RELAY_MODE: "openai", PUBLIC_APP_URL: "https://app.example", OPENAI_API_KEY: "synthetic-key" };
const request = (changes: { url?: string; origin?: string; upgrade?: string; protocol?: string; ip?: string } = {}) =>
  new Request(changes.url ?? "https://app.example/api/interview/audio", {
    headers: { origin: changes.origin ?? "https://app.example", upgrade: changes.upgrade ?? "websocket",
      "cf-connecting-ip": changes.ip ?? "192.0.2.1", ...(changes.protocol ? { "sec-websocket-protocol": changes.protocol } : {}) },
  });
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
beforeEach(() => {
  pairs.length = 0;
  vi.stubGlobal("WebSocketPair", class {
    0: Socket; 1: Socket;
    constructor() { this[0] = new Socket(); this[1] = new Socket(); pairs.push({ client: this[0], server: this[1] }); }
  });
  vi.stubGlobal("Response", UpgradeResponse);
});
afterEach(() => { for (const pair of pairs) pair.server.close(); vi.unstubAllGlobals(); });

describe("Cloudflare interview Durable Object", () => {
  it("denies missing key/config and untrusted upgrades before creating providers", async () => {
    const { db, sql } = interviewD1(), outbound = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", outbound);
    for (const env of [{ ...config, DB: db, OPENAI_API_KEY: "" }, { ...config, DB: db, INTERVIEW_RELAY_MODE: "google" }]) {
      const relay = new InterviewRelay({ waitUntil() {} }, env);
      expect((await relay.fetch(request())).status).toBe(503);
    }
    const relay = new InterviewRelay({ waitUntil() {} }, { ...config, DB: db });
    for (const change of [{ origin: "https://evil.example" }, { url: "https://evil.example/api/interview/audio" },
      { url: "https://app.example/api/interview/audio?ticket=secret" }, { url: "https://app.example/wrong" },
      { upgrade: "http" }, { protocol: "a" }])
      expect((await relay.fetch(request(change))).status).toBe(403);
    expect(outbound).not.toHaveBeenCalled();
    expect(pairs).toHaveLength(0);
    sql.close();
  });

  it("does not contact OpenAI for an idle connection, invalid ticket, oversized frame, or traffic after close", async () => {
    const { db, sql } = interviewD1(), outbound = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", outbound);
    const relay = new InterviewRelay({ waitUntil() {} }, { ...config, DB: db });
    expect((await relay.fetch(request())).status).toBe(101);
    expect(outbound).not.toHaveBeenCalled();
    const socket = pairs[0].server;
    socket.message(JSON.stringify({ type: "authorize", ticket: "a".repeat(64) }));
    await vi.waitFor(() => expect(socket.readyState).toBe(3));
    expect(socket.sent.at(-1)?.type).toBe("error");
    expect((await relay.fetch(request())).status).toBe(101);
    pairs[1].server.message("x".repeat(4097));
    await flush();
    expect(pairs[1].server.readyState).toBe(3);
    pairs[1].server.message('{"type":"authorize","ticket":"late"}');
    expect(outbound).not.toHaveBeenCalled();
    sql.close();
  });

  it("starts providers only for a redeemed active-admin ticket and retains cleanup until release", async () => {
    const { db, sql } = interviewD1();
    const pending = new Set<Promise<unknown>>();
    const state = { waitUntil(task: Promise<unknown>) { pending.add(task); void task.finally(() => pending.delete(task)); } };
    const outbound = vi.fn<typeof fetch>().mockImplementation(async () => new NativeResponse("denied", { status: 401 }));
    vi.stubGlobal("fetch", outbound);
    const env = { ...config, DB: db };
    const ticket = await createCloudflareRelayService(env).run("start", { id: "owner", role: "admin", entitlements: new Set(["access.manage"]) }, {}) as { ticket: string; id: string };
    const relay = new InterviewRelay(state, env);
    expect((await relay.fetch(request())).status).toBe(101);
    expect(outbound).not.toHaveBeenCalled();
    pairs[0].server.message(JSON.stringify({ type: "authorize", ticket: ticket.ticket }));
    await flush();
    await Promise.all([...pending]);
    await flush();
    expect(outbound).toHaveBeenCalledTimes(1);
    expect(pairs[0].server.sent.some(e => e.type === "ready")).toBe(true);
    expect(pairs[0].server.readyState).toBe(3);
    expect(sql.prepare("SELECT nonce,end_reason FROM interview_relay_sessions WHERE id=?").get(ticket.id)).toMatchObject({ nonce: null, end_reason: "PROVIDER_ERROR" });
    const count = outbound.mock.calls.length;
    pairs[0].server.message(new ArrayBuffer(3204));
    await flush();
    expect(outbound).toHaveBeenCalledTimes(count);
    sql.close();
  });

  it("enforces eight peers per named object and frees a slot synchronously on close", async () => {
    const { db, sql } = interviewD1();
    const relay = new InterviewRelay({ waitUntil() {} }, { ...config, DB: db });
    for (let i = 0; i < 8; i++) expect((await relay.fetch(request({ ip: `192.0.2.${i}` }))).status).toBe(101);
    expect((await relay.fetch(request({ ip: "192.0.2.9" }))).status).toBe(403);
    pairs[0].server.close();
    expect((await relay.fetch(request({ ip: "192.0.2.10" }))).status).toBe(101);
    sql.close();
  });

  it("routes every audio request to one fixed object and exposes no credentials from readiness", async () => {
    const names: string[] = [];
    const env = { ...config, DB: {} as CloudflareEnv["DB"], INTERVIEW_RELAY: {
      idFromName(name: string) { names.push(name); return name; },
      get() { return { fetch: async () => new NativeResponse("forwarded") }; },
    } };
    for (const ip of ["192.0.2.1", "192.0.2.2"]) {
      const response = await routeInterviewRelay(request({ ip }), env);
      expect(await response?.text()).toBe("forwarded");
    }
    expect(names).toHaveLength(2);
    expect(new Set(names).size).toBe(1);
    expect(routeInterviewRelay(new Request("https://app.example/unrelated"), env)).toBeNull();
    const response = await routeInterviewRelay(new Request("https://app.example/api/interview/health"), env);
    expect(await response?.json()).toEqual({ transport: "cloudflare", mode: "openai", configured: true });
    const unconfigured = await routeInterviewRelay(new Request("https://app.example/api/interview/health"), { ...env, OPENAI_API_KEY: "" });
    expect(unconfigured?.status).toBe(503);
    expect(await unconfigured?.text()).not.toContain("synthetic-key");
  });
});
