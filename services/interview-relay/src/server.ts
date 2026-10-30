import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { RelayConnection } from "./connection.js";
import type { Authority } from "./authority.js";
import type { SpeechAdapter, HintAdapter } from "./shared.js";
export function relayServer(config: {
  origin: string;
  mode: "mock" | "google" | "openai";
  authority: Authority;
  providers: () => { speech: SpeechAdapter; hints: HintAdapter };
}) {
  const http = createServer((req, res) => {
    res.setHeader("cache-control", "no-store");
    res.writeHead(req.url === "/health" ? 200 : 404);
    res.end(req.url === "/health" ? JSON.stringify({ ok: true, learningVersion: 1, mode: config.mode,
      release: /^[a-f0-9]{40}$/.test(process.env.RELEASE_SHA ?? "") ? process.env.RELEASE_SHA : null }) : "not found");
  });
  http.headersTimeout = 5_000;
  http.requestTimeout = 5_000;
  const sockets = new WebSocketServer({
    noServer: true,
    maxPayload: 4096,
    perMessageDeflate: false,
  });
  const attempts = new Map<string, { at: number; count: number }>();
  const peers = new Set<RelayConnection>();
  http.on("upgrade", (req, socket, head) => {
    const now = Date.now();
    for (const [ip, entry] of attempts) if (now - entry.at > 60_000) attempts.delete(ip);
    const ip = req.socket.remoteAddress ?? "unknown";
    const entry = attempts.get(ip) ?? { at: now, count: 0 };
    entry.count++;
    if (attempts.size < 1000 || attempts.has(ip)) attempts.set(ip, entry);
    // Origin is defense-in-depth only. Ticket + authenticated callback remain mandatory.
    if (
      req.url !== "/audio" ||
      req.headers.origin !== config.origin ||
      req.headers["sec-websocket-protocol"] ||
      sockets.clients.size >= 8 ||
      entry.count > 20 ||
      attempts.size >= 1000
    ) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    sockets.handleUpgrade(req, socket, head, (ws) => sockets.emit("connection", ws));
  });
  sockets.on("connection", (ws) => {
    const connection = new RelayConnection(
      {
        send: (event) => {
          if (ws.readyState === WebSocket.OPEN) {
            if (ws.bufferedAmount > 65_536) {
              ws.terminate();
              return;
            }
            ws.send(JSON.stringify(event));
          }
        },
        close: () => {
          ws.close(1000);
          const timer = setTimeout(() => ws.terminate(), 1000);
          timer.unref();
        },
      },
      config.authority,
      config.mode,
      config.providers,
    );
    peers.add(connection);
    ws.on("message", (raw, binary) => {
      void connection.message(Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer), binary);
    });
    ws.on("error", () => connection.close());
    ws.on("close", () => {
      connection.close();
      peers.delete(connection);
    });
  });
  return {
    http,
    close: async () => {
      for (const peer of peers) peer.close();
      for (const ws of sockets.clients) ws.terminate();
      sockets.close();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}
