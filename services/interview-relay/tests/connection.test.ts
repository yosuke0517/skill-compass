import { test } from "node:test";
import assert from "node:assert/strict";
import { RelayConnection } from "../src/connection.js";
import type { Grant, Authority } from "../src/authority.js";
import type { Event } from "../src/shared.js";
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
function setup(
  options: {
    reject?: boolean;
    hint?: Promise<string[]>;
    mode?: "mock" | "google";
    interval?: number;
  } = {},
) {
  let now = Date.now(),
    created = 0,
    closed = 0,
    writes = 0,
    emitter: (e: Event) => void = () => {};
  const sent: Record<string, unknown>[] = [],
    calls: string[] = [];
  let grant: Grant;
  const authority: Authority = {
    async call(op, input, signal) {
      calls.push(op);
      signal.throwIfAborted();
      if (options.reject) throw new Error("denied");
      if (op === "redeem")
        grant = {
          id: "session",
          owner: "owner",
          nonce: (input as { nonce: string }).nonce,
          generation: 1,
          expiresAt: now + 2_400_000,
          leaseUntil: now + 30_000,
          mode: options.mode ?? "mock",
        };
      if (op === "lease" || op === "hint") grant = { ...grant, leaseUntil: now + 30000 };
      return grant;
    },
  };
  const c = new RelayConnection(
    { send: (e) => sent.push(e as Record<string, unknown>), close: () => {} },
    authority,
    "mock",
    () => {
      created++;
      return {
        speech: {
          open(_source, emit) {
            emitter = emit;
            return {
              write() {
                writes++;
              },
              close() {
                closed++;
              },
            };
          },
        },
        hints: {
          async generate(_turns, signal) {
            if (options.hint) return options.hint;
            signal.throwIfAborted();
            return ["観点を確認", "経験を思い出す"];
          },
        },
      };
    },
    () => now,
    options.interval ?? 15000,
  );
  return {
    c,
    sent,
    calls,
    auth: () =>
      c.message(Buffer.from(JSON.stringify({ type: "authorize", ticket: "a".repeat(64) })), false),
    emit: (event: Event) => emitter(event),
    stats: () => ({ created, closed, writes }),
    tick: (ms: number) => {
      now += ms;
    },
  };
}
test("unauthorized audio, denied ticket and mismatched provider mode never construct providers", async () => {
  const a = setup();
  await a.c.message(Buffer.alloc(3204), true);
  assert.equal(a.stats().created, 0);
  for (const config of [{ reject: true }, { mode: "google" as const }]) {
    const x = setup(config);
    await x.auth();
    assert.equal(x.stats().created, 0);
    x.c.close();
  }
});
test("only successful authorization enables PCM; gaps and repeat frames stop immediately", async () => {
  const x = setup();
  await x.auth();
  assert.equal(x.stats().created, 1);
  const audio = Buffer.alloc(3204);
  audio.writeUInt32BE(1);
  await x.c.message(audio, true);
  assert.equal(x.stats().writes, 1);
  await x.c.message(audio, true);
  assert.equal(x.stats().closed, 1);
  assert.equal(x.stats().writes, 1);
  assert.ok(x.calls.includes("release"));
});
test("auth timeout never starts providers and cleans up a late grant", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  let resolve!: (g: Grant) => void;
  let nonce = "";
  let created = 0;
  const calls: string[] = [];
  const authority: Authority = {
    call(op, input) {
      calls.push(op);
      if (op === "redeem") {
        nonce = (input as { nonce: string }).nonce;
        return new Promise((r) => (resolve = r));
      }
      return Promise.resolve({} as Grant);
    },
  };
  const c = new RelayConnection({ send() {}, close() {} }, authority, "mock", () => {
    created++;
    throw new Error("not allowed");
  });
  const pending = c.message(
    Buffer.from(JSON.stringify({ type: "authorize", ticket: "a".repeat(64) })),
    false,
  );
  t.mock.timers.tick(5001);
  resolve({
    id: "x",
    owner: "o",
    nonce,
    generation: 1,
    expiresAt: Date.now() + 10000,
    leaseUntil: Date.now() + 10000,
    mode: "mock",
  });
  await pending;
  assert.equal(created, 0);
  assert.ok(calls.includes("release"));
  c.close();
});
test("stop aborts pending hint and suppresses every late transcript/hint", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  let resolve!: (lines: string[]) => void;
  const x = setup({ hint: new Promise((r) => (resolve = r)) });
  await x.auth();
  x.emit({ type: "transcript", source: "interviewer", text: "質問", final: true });
  t.mock.timers.tick(300);
  await flush();
  assert.ok(x.calls.includes("hint"));
  x.c.close();
  resolve(["遅いヒント", "二行目"]);
  await flush();
  x.emit({ type: "transcript", source: "interviewer", text: "late", final: true });
  assert.equal(x.sent.filter((e) => e.type === "hints").length, 0);
  assert.equal(x.sent.filter((e) => e.type === "transcript").length, 1);
});
test("lease expiration shuts speech even if renewal has not returned", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const x = setup();
  await x.auth();
  x.tick(30001);
  t.mock.timers.tick(30001);
  assert.equal(x.stats().closed, 1);
  assert.ok(x.sent.some((e) => e.type === "error"));
});
test("mock sample follows transcript to authorized hint", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const x = setup();
  await x.auth();
  await x.c.message(Buffer.from(JSON.stringify({ type: "sample", text: "質問" })), false);
  t.mock.timers.tick(300);
  await flush();
  assert.ok(x.sent.some((e) => e.type === "hints"));
  assert.equal(x.calls.filter((c) => c === "hint").length, 1);
  x.c.close();
});
test("bounded real-time audio and input messages prevent a burst from reaching speech", async () => {
  const x = setup();
  await x.auth();
  for (let i = 1; i <= 21; i++) {
    const b = Buffer.alloc(3204);
    b.writeUInt32BE(i);
    await x.c.message(b, true);
  }
  assert.equal(x.stats().writes, 20);
  assert.equal(x.stats().closed, 1);
});

test("an unresponsive hint is aborted at eight seconds and reports a visible timeout", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const x = setup({ hint: new Promise(() => {}) });
  await x.auth();
  x.emit({ type: "transcript", source: "interviewer", text: "質問", final: true });
  t.mock.timers.tick(300);
  await flush();
  t.mock.timers.tick(8000);
  assert.ok(x.sent.some((e) => e.type === "warning" && String(e.message).includes("タイムアウト")));
  x.c.close();
});
