import { Buffer } from "node:buffer";
import { OpenAISpeechCore, type SpeechSocket } from "./openai-speech-core.js";

export interface UpgradeSocket extends EventTarget {
  readonly readyState: number;
  readonly bufferedAmount?: number;
  accept(): void;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

/** Adapts Workers' asynchronous fetch Upgrade to the shared socket state machine. */
class FetchSocket implements SpeechSocket {
  private socket?: UpgradeSocket;
  private cancelled = false;
  private controller = new AbortController();
  private listeners = new Map<string, ((...args: unknown[]) => void)[]>();
  constructor(key: string, request: typeof fetch) {
    // Allow the core to register handlers before a synchronous request failure.
    void Promise.resolve().then(async () => {
      if (this.cancelled) return;
      try {
        const response = await request("https://api.openai.com/v1/realtime?intent=transcription", {
          headers: { Upgrade: "websocket", Authorization: `Bearer ${key}` },
          redirect: "error",
          signal: AbortSignal.any([this.controller.signal, AbortSignal.timeout(10000)]),
        });
        const socket = (response as Response & { webSocket?: UpgradeSocket }).webSocket;
        if (response.status !== 101 || !socket) {
          await response.body?.cancel();
          throw new Error("Upgrade failed");
        }
        if (this.cancelled) { socket.accept(); socket.close(1000); return; }
        this.socket = socket;
        socket.addEventListener("message", event => {
          if (this.cancelled) return;
          const data: unknown = (event as MessageEvent).data;
          if (typeof data === "string") this.emit("message", data);
          else if (data instanceof ArrayBuffer && data.byteLength <= 65536)
            this.emit("message", Buffer.from(data));
          else this.emit("error");
        });
        socket.addEventListener("error", () => this.emit("error"));
        socket.addEventListener("close", () => this.emit("close"));
        socket.accept();
        if (this.cancelled) { socket.close(1000); return; }
        this.emit("open");
      } catch { if (!this.cancelled) this.emit("error"); }
    });
  }
  get readyState() { return this.cancelled ? 3 : this.socket?.readyState ?? 0; }
  // Workers currently does not expose network queue size. Frame/rate bounds are
  // enforced by the core; bufferedAmount is honored only on runtimes exposing it.
  get bufferedAmount() { return this.socket?.bufferedAmount ?? 0; }
  on(event: string, listener: (...args: unknown[]) => void) {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
  }
  private emit(event: string, ...args: unknown[]) {
    if (!this.cancelled) for (const listener of this.listeners.get(event) ?? []) listener(...args);
  }
  send(data: string) {
    if (this.cancelled || !this.socket || this.socket.readyState !== 1)
      throw new Error("Socket unavailable");
    this.socket.send(data);
  }
  terminate() {
    if (this.cancelled) return;
    this.cancelled = true;
    this.controller.abort();
    this.listeners.clear();
    try { this.socket?.close(1000); } catch { /* Already closed. */ }
    this.socket = undefined;
  }
}

export class CloudflareSpeech extends OpenAISpeechCore {
  constructor(key: string, request: typeof fetch = fetch) {
    super(key, key => new FetchSocket(key, request));
  }
}
