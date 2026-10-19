export type RelayEvent =
  | { type: "transcript"; text: string; final: boolean }
  | { type: "hints"; lines: string[]; generationId?: string }
  | { type: "warning"; message: string };
export type RelayTransport = {
  audio(buffer: ArrayBuffer): void;
  sample(text: string): void;
  close(): void;
};
export function connectRelay(
  url: string,
  ticket: string,
  expectedId: string,
  signal: AbortSignal,
  onEvent: (event: RelayEvent) => void,
  onDisconnect: (message: string) => void,
): Promise<RelayTransport> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let ready = false,
      closed = false,
      sequence = 0,
      ack = 0;
    // Allow a scale-to-zero relay to start, while staying within the 30s ticket lifetime.
    const timeout = setTimeout(() => fail("中継接続がタイムアウトしました。"), 20_000);
    const close = () => {
      if (closed) return;
      closed = true;
      clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "stop" }));
      ws.close();
    };
    const fail = (message: string) => {
      if (closed) return;
      close();
      if (!ready) reject(new Error(message));
      else onDisconnect(message);
    };
    const abort = () => {
      if (!ready) reject(new DOMException("停止しました。", "AbortError"));
      close();
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    ws.onopen = () => {
      if (!closed) ws.send(JSON.stringify({ type: "authorize", ticket }));
    };
    ws.onerror = () => fail("中継サーバーへ接続できません。");
    ws.onclose = () => fail("音声接続が終了しました。再接続中の音声は復元されません。");
    ws.onmessage = ({ data }) => {
      if (closed) return;
      try {
        if (typeof data !== "string" || data.length > 16_384) throw new Error();
        const event = JSON.parse(data);
        if (event.type === "error") {
          fail(typeof event.message === "string" ? event.message : "音声処理を停止しました。");
          return;
        }
        if (!ready) {
          if (event.type !== "ready" || event.id !== expectedId) throw new Error();
          ready = true;
          clearTimeout(timeout);
          resolve({
            close,
            sample(text) {
              if (!closed && ws.readyState === WebSocket.OPEN)
                ws.send(JSON.stringify({ type: "sample", text }));
            },
            audio(buffer) {
              if (closed) return;
              if (
                buffer.byteLength !== 3200 ||
                ws.readyState !== WebSocket.OPEN ||
                sequence - ack >= 20 ||
                ws.bufferedAmount > 64_000
              ) {
                fail("音声送信が追いつきません。取得を停止しました。");
                return;
              }
              const frame = new Uint8Array(3204);
              new DataView(frame.buffer).setUint32(0, ++sequence);
              frame.set(new Uint8Array(buffer), 4);
              ws.send(frame);
            },
          });
          return;
        }
        if (event.type === "ack") {
          if (
            !Number.isSafeInteger(event.sequence) ||
            event.sequence < ack ||
            event.sequence > sequence
          )
            throw new Error();
          ack = event.sequence;
        } else if (
          event.type === "transcript" &&
          typeof event.text === "string" &&
          typeof event.final === "boolean"
        )
          onEvent({ type: "transcript", text: event.text.slice(0, 1000), final: event.final });
        else if (
          event.type === "hints" &&
          Array.isArray(event.lines) &&
          event.lines.length >= 2 &&
          event.lines.length <= 3 &&
          event.lines.every((s: unknown) => typeof s === "string" && s.length <= 60)
        )
          onEvent(event);
        else if (event.type === "warning" && typeof event.message === "string") onEvent(event);
      } catch {
        fail("中継サーバーの応答を確認できません。");
      }
    };
  });
}
