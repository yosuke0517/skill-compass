// @vitest-environment node
import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { CloudflareSpeech } from "../../services/interview-relay/src/adapters/cloudflare-speech";
import type { Event as SpeechEvent } from "../../services/interview-relay/src/shared";

class Socket extends EventTarget {
  readyState = 1;
  sent: object[] = [];
  accepted = false;
  accept() { this.accepted = true; }
  send(data: string) { this.sent.push(JSON.parse(data)); }
  close() {
    if (!this.accepted) throw new TypeError("WebSocket must be accepted before close");
    this.readyState = 3; this.dispatchEvent(new Event("close"));
  }
  message(data: string) { this.dispatchEvent(new MessageEvent("message", { data })); }
}
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const upgrade = (socket: Socket) => ({ status: 101, webSocket: socket }) as unknown as Response;

describe("Cloudflare OpenAI fetch Upgrade transport", () => {
  it("initializes the existing transcription protocol after Upgrade and suppresses traffic after close", async () => {
    const socket = new Socket(), events: SpeechEvent[] = [];
    let request: { url: string; init?: RequestInit } | undefined;
    const speech = new CloudflareSpeech("synthetic-key", async (url, init) => {
      request = { url: String(url), init };
      return upgrade(socket);
    });
    const stream = speech.open("interviewer", e => events.push(e));
    stream.write(Buffer.alloc(3200));
    await flush();
    expect(request?.url).toBe("https://api.openai.com/v1/realtime?intent=transcription");
    expect(new Headers(request?.init?.headers).get("Upgrade")).toBe("websocket");
    expect(new Headers(request?.init?.headers).get("Authorization")).toBe("Bearer synthetic-key");
    expect(socket.accepted).toBe(true);
    expect(socket.sent[0]).toMatchObject({ type: "session.update", session: { type: "transcription" } });
    socket.message('{"type":"session.updated"}');
    stream.close();
    const count = socket.sent.length;
    socket.message('{"type":"conversation.item.input_audio_transcription.delta","item_id":"late","delta":"late"}');
    stream.write(Buffer.alloc(3200));
    expect(socket.readyState).toBe(3);
    expect(socket.sent).toHaveLength(count);
    expect(events).toEqual([]);
  });

  it("cancels an unfinished Upgrade and closes a late successful socket without sending initialization", async () => {
    let resolve!: (response: Response) => void;
    let signal: AbortSignal | undefined;
    const socket = new Socket(), events: SpeechEvent[] = [];
    const stream = new CloudflareSpeech("key", async (_url, init) => {
      signal = init?.signal as AbortSignal;
      return new Promise<Response>(done => { resolve = done; });
    }).open("interviewer", e => events.push(e));
    await flush();
    stream.close();
    expect(signal?.aborted).toBe(true);
    resolve(upgrade(socket));
    await flush();
    expect(socket.readyState).toBe(3);
    expect(socket.sent).toEqual([]);
    expect(events).toEqual([]);
  });

  it("never starts an upstream request when closed before the asynchronous initialization runs", async () => {
    let calls = 0;
    const stream = new CloudflareSpeech("key", async () => { calls++; return new Response(null, { status: 401 }); })
      .open("interviewer", () => { throw new Error("late event"); });
    stream.close();
    await flush();
    expect(calls).toBe(0);
  });

  it("sanitizes handshake errors and refuses oversized upstream messages", async () => {
    for (const request of [
      async () => { throw new Error("synthetic-private-provider-diagnostic"); },
      async () => new Response("synthetic-private-provider-diagnostic", { status: 401 }),
    ]) {
      const events: SpeechEvent[] = [];
      const stream = new CloudflareSpeech("key", request).open("interviewer", e => events.push(e));
      await flush();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("error");
      expect(JSON.stringify(events)).not.toContain("private-provider");
      stream.close();
    }
    const socket = new Socket(), events: SpeechEvent[] = [];
    const stream = new CloudflareSpeech("key", async () => upgrade(socket)).open("interviewer", e => events.push(e));
    await flush();
    socket.message(JSON.stringify({ type: "ignored", data: "a".repeat(65536) }));
    expect(socket.readyState).toBe(3);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("error");
    stream.close();
  });

  it("bounds unacknowledged audio even when the platform exposes no network bufferedAmount", async () => {
    const socket = new Socket(), events: SpeechEvent[] = [];
    const stream = new CloudflareSpeech("key", async () => upgrade(socket)).open("interviewer", e => events.push(e));
    await flush();
    socket.message('{"type":"session.updated"}');
    const audio = Buffer.alloc(3200);
    for (let i = 0; i < 1600; i++) audio.writeInt16LE(i % 2 ? 3000 : -3000, i * 2);
    for (let i = 0; i < 150; i++) stream.write(audio);
    expect(events).toEqual([]); // A valid 15-second utterance is accepted intact.
    for (let i = 0; i < 250; i++) stream.write(audio);
    expect(socket.readyState).toBe(3);
    expect(events).toHaveLength(1);
    const append = socket.sent.filter(e => (e as { type: string }).type === "input_audio_buffer.append");
    expect(append.length).toBeLessThan(330);
    stream.close();
  });
});
