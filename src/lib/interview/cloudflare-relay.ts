import { Buffer } from "node:buffer";
import { RelayConnection } from "../../../services/interview-relay/src/connection";
import { CloudflareSpeech, type UpgradeSocket } from "../../../services/interview-relay/src/adapters/cloudflare-speech";
import { OpenAIHints } from "../../../services/interview-relay/src/adapters/openai-hints";
import { RotatingSpeech } from "../../../services/interview-relay/src/adapters/rotating";
import {
  createCloudflareRelayService, DirectRelayAuthority, requireCloudflareOpenAIKey,
  type CloudflareRelayEnvironment,
} from "./cloudflare-service";
import { cloudflareRelaySettings } from "./relay-settings";

type RelayState = { waitUntil(task: Promise<unknown>): void };
type RelayNamespace = {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
};
export type InterviewRelayEnvironment = CloudflareRelayEnvironment & {
  INTERVIEW_RELAY?: RelayNamespace;
  MAINTENANCE_MODE?: string;
};
const audioPath = "/api/interview/audio";
const healthPath = "/api/interview/health";
const deny = (status: number) => Response.json({ error: "面接中継に接続できません。設定または接続条件を確認してください。" },
  { status, headers: { "Cache-Control": "no-store" } });

/** One fixed object retains the existing global cap of eight relay connections. */
export function routeInterviewRelay(request: Request, env: InterviewRelayEnvironment): Promise<Response> | null {
  const path = new URL(request.url).pathname;
  if (path !== audioPath && path !== healthPath) return null;
  if (env.INTERVIEW_RELAY_TRANSPORT !== "cloudflare") return Promise.resolve(deny(503));
  if (path === healthPath) {
    let configured = false;
    try {
      cloudflareRelaySettings(env);
      requireCloudflareOpenAIKey(env);
      configured = !!env.INTERVIEW_RELAY && env.MAINTENANCE_MODE !== "read_only";
    } catch { /* Report readiness without secrets or provider traffic. */ }
    return Promise.resolve(Response.json({ transport: "cloudflare", mode: "openai", configured },
      { status: configured ? 200 : 503, headers: { "Cache-Control": "no-store" } }));
  }
  if (!env.INTERVIEW_RELAY) return Promise.resolve(deny(503));
  const id = env.INTERVIEW_RELAY.idFromName("interview-audio");
  return env.INTERVIEW_RELAY.get(id).fetch(request);
}

/** In-memory connections only: no audio/transcript is written to DO storage. */
export class InterviewRelay {
  private peers = new Set<RelayConnection>();
  private attempts = new Map<string, { at: number; count: number }>();
  constructor(private state: RelayState, private env: InterviewRelayEnvironment) {}

  async fetch(request: Request): Promise<Response> {
    let config: ReturnType<typeof cloudflareRelaySettings>, key: string;
    try {
      config = cloudflareRelaySettings(this.env);
      key = requireCloudflareOpenAIKey(this.env);
      if (this.env.MAINTENANCE_MODE === "read_only") return deny(503);
    } catch { return deny(503); }
    const url = new URL(request.url);
    if (request.method !== "GET" || url.origin !== config.origin || url.pathname !== audioPath ||
      url.search || url.hash || request.headers.get("origin") !== config.origin ||
      request.headers.get("upgrade")?.toLowerCase() !== "websocket" ||
      request.headers.has("sec-websocket-protocol")) return deny(403);
    const now = Date.now();
    for (const [ip, value] of this.attempts) if (now - value.at > 60000) this.attempts.delete(ip);
    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    const entry = this.attempts.get(ip) ?? { at: now, count: 0 };
    entry.count++;
    if (this.attempts.size < 1000 || this.attempts.has(ip)) this.attempts.set(ip, entry);
    if (this.peers.size >= 8 || entry.count > 20 || this.attempts.size >= 1000) return deny(403);

    const Pair = (globalThis as unknown as { WebSocketPair: new () => { 0: UpgradeSocket; 1: UpgradeSocket } }).WebSocketPair;
    const pair = new Pair(), socket = pair[1];
    let closed = false, pending = 0, sentAt = now, sentBytes = 0, sentMessages = 0;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      socket.removeEventListener("message", message);
      socket.removeEventListener("close", cleanup);
      socket.removeEventListener("error", cleanup);
      this.peers.delete(connection);
      connection.close();
      try { socket.close(1000); } catch { /* Peer already closed. */ }
    };
    const connection = new RelayConnection({
      send: event => {
        if (closed || socket.readyState !== 1) return;
        try {
          const text = JSON.stringify(event), bytes = Buffer.byteLength(text);
          if (Date.now() - sentAt >= 1000) { sentAt = Date.now(); sentBytes = 0; sentMessages = 0; }
          sentBytes += bytes; sentMessages++;
          if (bytes > 65536 || sentBytes > 65536 || sentMessages > 128 || (socket.bufferedAmount ?? 0) > 65536) {
            cleanup(); return;
          }
          socket.send(text);
        } catch { cleanup(); }
      },
      close: cleanup,
    }, new DirectRelayAuthority(createCloudflareRelayService(this.env)), "openai", () => ({
      speech: new RotatingSpeech(new CloudflareSpeech(key)),
      hints: new OpenAIHints(key, config.model),
    }), Date.now, 15000, task => this.state.waitUntil(task));
    const message = (event: Event) => {
      if (closed) return;
      const data: unknown = (event as MessageEvent).data;
      const binary = data instanceof ArrayBuffer;
      // Bound before copying into Buffer. No queued audio tasks survive close.
      if ((!binary && typeof data !== "string") ||
        (binary ? data.byteLength : Buffer.byteLength(data as string)) > 4096 || pending >= 16) {
        cleanup(); return;
      }
      const raw = binary ? Buffer.from(data) : Buffer.from(data as string);
      pending++;
      const task = connection.message(raw, binary).catch(cleanup).finally(() => { pending--; });
      this.state.waitUntil(task);
    };
    this.peers.add(connection);
    socket.addEventListener("message", message);
    socket.addEventListener("close", cleanup);
    socket.addEventListener("error", cleanup);
    socket.accept();
    return new Response(null, { status: 101, webSocket: pair[0] } as ResponseInit);
  }
}
