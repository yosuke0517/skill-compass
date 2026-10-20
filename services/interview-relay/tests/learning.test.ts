import { test } from "node:test";
import assert from "node:assert/strict";
import { VertexHints } from "../src/adapters/hints.js";
import type { HintTrace } from "../src/shared.js";
import { RelayConnection } from "../src/connection.js";
import type { Authority, Grant } from "../src/authority.js";
test("trace records exact outgoing JSON without credentials or thought text", async () => {
  const traces: HintTrace[] = [];
  let body: unknown;
  const hints = new VertexHints(
    "project-test",
    "gemini-test",
    async () => "secret-token",
    async (_url, init) => {
      body = JSON.parse(String(init?.body));
      return Response.json({
        candidates: [
          {
            content: {
              parts: [{ thought: true, text: "private thought" }, { text: JSON.stringify({ lines: ["確認する", "構成する"] }) }],
            },
          },
        ],
      });
    },
  );
  assert.deepEqual(
    await hints.generate(
      [{ source: "interviewer", text: "質問" }],
      new AbortController().signal,
      async (t) => {
        traces.push(t);
      },
    ),
    ["確認する", "構成する"],
  );
  assert.deepEqual(traces[0].request?.body, body);
  assert.equal(traces[0].request?.promptVersion, "interview-cues-v2-latest");
  assert.equal(traces[1].output, JSON.stringify({ lines: ["確認する", "構成する"] }));
  assert.ok(!JSON.stringify(traces).includes("secret-token"));
  assert.ok(!JSON.stringify(traces).includes("private thought"));
});
for (const saveLearning of [false, true])
  test(`opt-in ${saveLearning}: logs generation before release on stop`, async () => {
    let grant: Grant;
    const calls: string[] = [],
      events: Record<string, unknown>[] = [];
    const authority: Authority = {
      async call(op, input) {
        calls.push(op);
        if (op === "record") events.push((input as { event: Record<string, unknown> }).event);
        if (op === "redeem")
          grant = {
            id: "s",
            owner: "o",
            nonce: (input as { nonce: string }).nonce,
            generation: 1,
            expiresAt: Date.now() + 100000,
            leaseUntil: Date.now() + 30000,
            mode: "mock",
            saveLearning,
          };
        return grant;
      },
    };
    let started!: () => void;
    const running = new Promise<void>((resolve) => (started = resolve));
    const c = new RelayConnection({ send() {}, close() {} }, authority, "mock", () => ({
      speech: {
        open() {
          return { write() {}, close() {} };
        },
      },
      hints: {
        async generate(_turns, signal, trace) {
          if (trace) await trace({ request: { model: "mock", promptVersion: "test", body: {} } });
          started();
          await new Promise<void>((resolve) =>
            signal.addEventListener("abort", () => resolve(), { once: true }),
          );
          signal.throwIfAborted();
          return [];
        },
      },
    }));
    await c.message(
      Buffer.from(JSON.stringify({ type: "authorize", ticket: "a".repeat(64) })),
      false,
    );
    await c.message(Buffer.from(JSON.stringify({ type: "sample", text: "質問" })), false);
    await running;
    c.close();
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(calls.at(-1), "release");
    assert.deepEqual(
      events.map((e) => e.kind),
      saveLearning ? ["turn", "request", "result"] : [],
    );
    if (saveLearning) assert.equal(events.at(-1)?.status, "aborted");
  });

test("completed generation does not time out while its result record drains", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const sent: Record<string, unknown>[] = [];
  let finishRecord!: () => void;
  const resultPending = new Promise<void>((resolve) => { finishRecord = resolve; });
  let grant: Grant;
  const authority: Authority = {
    async call(op, input) {
      if (op === "redeem") grant = { id: "s", owner: "o", nonce: (input as {nonce: string}).nonce,
        generation: 1, expiresAt: Date.now()+3600000, leaseUntil: Date.now()+30000,
        mode: "mock", saveLearning: true };
      if (op === "record" && (input as {event: {kind: string}}).event.kind === "result") await resultPending;
      return grant;
    },
  };
  const c = new RelayConnection({send(event) { sent.push(event as Record<string, unknown>); },close() {}}, authority, "mock", () => ({
    speech: {open() {return {write() {},close() {}};}},
    hints: {async generate(_turns, _signal, trace) {
      await trace?.({request: {model:"mock",promptVersion:"test",body:{}}});
      return ["確認", "構成"];
    }},
  }));
  await c.message(Buffer.from(JSON.stringify({type:"authorize",ticket:"a".repeat(64)})), false);
  await c.message(Buffer.from(JSON.stringify({type:"sample",text:"質問"})),false);
  t.mock.timers.tick(300);
  for(let i=0;i<30;i++) await Promise.resolve();
  t.mock.timers.tick(8001);
  finishRecord();
  for(let i=0;i<30;i++) await Promise.resolve();
  c.close();
  assert.equal(sent.filter(e=>e.type==="warning").length,0);
  assert.equal(sent.filter(e=>e.type==="hints").length,1);
});
