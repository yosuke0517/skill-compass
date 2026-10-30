import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectRelay } from "@/lib/interview/relay-client";

class Socket {
  static OPEN = 1;
  static latest: Socket;
  readyState = 0;
  bufferedAmount = 0;
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  onerror?: () => void;
  onclose?: () => void;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = 3;
  });
  constructor() {
    Socket.latest = this;
  }
  ready() {
    this.readyState = 1;
    this.onopen?.();
    this.onmessage?.({ data: JSON.stringify({ type: "ready", id: "session" }) });
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", Socket);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("relay connection startup", () => {
  const start = (signal = new AbortController().signal) =>
    connectRelay("wss://relay.example/audio", "ticket", "session", signal, vi.fn(), vi.fn());

  it("accepts a relay that becomes ready after the previous 8s deadline", async () => {
    const pending = start();
    await vi.advanceTimersByTimeAsync(12_000);
    expect(Socket.latest.close).not.toHaveBeenCalled();
    Socket.latest.ready();
    const transport = await pending;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(Socket.latest.close).not.toHaveBeenCalled();
    transport.close();
  });

  it("closes a stalled relay before its 30s ticket expires", async () => {
    const pending = expect(start()).rejects.toThrow("タイムアウト");
    await vi.advanceTimersByTimeAsync(20_000);
    await pending;
    expect(Socket.latest.close).toHaveBeenCalledOnce();
  });

  it("honors manual stop immediately during the longer startup wait", async () => {
    const controller = new AbortController();
    const pending = expect(start(controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(9_000);
    controller.abort();
    await pending;
    Socket.latest.ready();
    expect(Socket.latest.send).not.toHaveBeenCalled();
    expect(Socket.latest.close).toHaveBeenCalledOnce();
  });
});
