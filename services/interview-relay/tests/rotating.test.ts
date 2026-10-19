import { test } from "node:test";
import assert from "node:assert/strict";
import { RotatingSpeech } from "../src/adapters/rotating.js";
import type { Event, SpeechAdapter } from "../src/shared.js";
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
test("60-minute equivalent graceful rotation: every chunk once, final order, close and reconnect", async () => {
  const events: Event[] = [],
    received: number[] = [],
    finalized: number[] = [];
  let opens = 0,
    closes = 0;
  const adapter: SpeechAdapter = {
    open(source, emit) {
      const id = opens++;
      const chunks: number[] = [];
      let closed = false;
      return {
        write(buffer) {
          chunks.push(buffer.readUInt16LE());
          received.push(buffer.readUInt16LE());
        },
        async finish() {
          await sleep(id % 2 ? 2 : 5);
          if (!closed) {
            finalized.push(id);
            emit({
              type: "transcript",
              source,
              text: `part-${id}:` + chunks.join(","),
              final: true,
            });
          }
        },
        close() {
          if (!closed) {
            closed = true;
            closes++;
          }
        },
      };
    },
  };
  const adapterWithRotation = new RotatingSpeech(adapter, 10, 100);
  const stream = adapterWithRotation.open("interviewer", (e) => events.push(e));
  let index = 0;
  const writer = setInterval(() => {
    const chunk = Buffer.alloc(2);
    chunk.writeUInt16LE(index++);
    stream.write(chunk);
  }, 1);
  await sleep(165);
  clearInterval(writer);
  await sleep(6);
  stream.close();
  const count = opens;
  await sleep(20);
  assert.ok(count >= 16);
  assert.equal(opens, count);
  assert.equal(closes, count);
  assert.deepEqual(
    received,
    Array.from({ length: index }, (_, i) => i),
  );
  assert.deepEqual(
    events
      .filter((e) => e.type === "transcript")
      .map((e) =>
        Number((e as Extract<Event, { type: "transcript" }>).text.match(/part-(\d+)/)![1]),
      ),
    finalized,
  );
  const before = events.length;
  stream.write(Buffer.alloc(2));
  assert.equal(received.length, index);
  assert.equal(events.length, before);
  const second = adapterWithRotation.open("interviewer", (e) => events.push(e));
  second.write(Buffer.alloc(2));
  second.close();
  assert.equal(closes, opens);
});
test("new stream final waits for old stream final; repeated words are not text-deduplicated", async () => {
  const events: Event[] = [];
  let next = 0,
    release: (() => void) | undefined;
  const adapter: SpeechAdapter = {
    open(source, emit) {
      const id = next++;
      return {
        write() {
          if (id === 1) emit({ type: "transcript", source, text: "はい", final: true });
        },
        finish() {
          return new Promise<void>((resolve) => {
            release = () => {
              emit({ type: "transcript", source, text: "はい", final: true });
              resolve();
            };
          });
        },
        close() {},
      };
    },
  };
  const stream = new RotatingSpeech(adapter, 20, 100).open("interviewer", (e) => events.push(e));
  await sleep(24);
  stream.write(Buffer.alloc(2));
  assert.equal(events.filter((e) => e.type === "transcript").length, 0);
  release!();
  await sleep(1);
  assert.deepEqual(
    events
      .filter((e) => e.type === "transcript")
      .map((e) => (e as Extract<Event, { type: "transcript" }>).text),
    ["はい", "はい"],
  );
  stream.close();
});
test("drain timeout reports error and closes every stream; stop suppresses draining final", async () => {
  const events: Event[] = [];
  let closes = 0;
  const adapter: SpeechAdapter = {
    open() {
      return {
        write() {},
        finish: () => new Promise<void>(() => {}),
        close() {
          closes++;
        },
      };
    },
  };
  const stream = new RotatingSpeech(adapter, 10, 5).open("interviewer", (e) => events.push(e));
  await sleep(28);
  assert.equal(events.filter((e) => e.type === "error").length, 1);
  assert.equal(closes, 2);
  stream.close();
});
test("closing during drain cancels late finals and queued new results", async () => {
  const events: Event[] = [];
  let release: (() => void) | undefined;
  let n = 0;
  const a: SpeechAdapter = {
    open(source, emit) {
      const id = n++;
      return {
        write() {
          if (id) emit({ type: "transcript", source, text: "queued", final: true });
        },
        finish() {
          return new Promise<void>((resolve) => {
            release = () => {
              emit({ type: "transcript", source, text: "late", final: true });
              resolve();
            };
          });
        },
        close() {},
      };
    },
  };
  const stream = new RotatingSpeech(a, 10, 100).open("interviewer", (e) => events.push(e));
  await sleep(14);
  stream.write(Buffer.alloc(2));
  stream.close();
  release!();
  await sleep(2);
  assert.equal(events.length, 0);
});
