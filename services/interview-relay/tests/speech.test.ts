import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { GoogleSpeech } from "../src/adapters/speech.js";
import type { Event } from "../src/shared.js";
test("Google V2 contract: config first, LINEAR16, bounded chunks, cancel, stale suppression", () => {
  type Write = {
    recognizer?: string;
    audio?: Buffer;
    streamingConfig?: { config: { explicitDecodingConfig: { sampleRateHertz: number } } };
  };
  const writes: Write[] = [],
    events: Event[] = [];
  let cancelled = false;
  const transport = Object.assign(new EventEmitter(), {
    write(value: Write) {
      writes.push(value);
      return true;
    },
    cancel() {
      cancelled = true;
    },
    destroy() {},
    end() {
      transport.emit("data", {
        results: [
          {
            resultEndOffset: { seconds: 1 },
            isFinal: true,
            alternatives: [{ transcript: "final on end" }],
          },
        ],
      });
      transport.emit("end");
    },
  });
  const adapter = new GoogleSpeech("test-project", "us", "chirp_3", {
    _streamingRecognize() {
      return transport;
    },
  } as unknown as NonNullable<ConstructorParameters<typeof GoogleSpeech>[3]>);
  const stream = adapter.open("interviewer", (e) => events.push(e));
  assert.equal(writes[0].recognizer, "projects/test-project/locations/us/recognizers/_");
  assert.equal(writes[0].audio, undefined);
  assert.equal(writes[0].streamingConfig!.config.explicitDecodingConfig.sampleRateHertz, 16000);
  stream.write(Buffer.alloc(3200));
  assert.equal(writes[1].audio!.length, 3200);
  assert.equal(writes[1].streamingConfig, undefined);
  assert.throws(() => stream.write(Buffer.alloc(25000)), /不正/);
  transport.emit("data", { results: [{ isFinal: true, alternatives: [{ transcript: "質問" }] }] });
  assert.equal(events[0].type, "transcript");
  stream.close();
  assert.equal(cancelled, true);
  transport.emit("data", { results: [{ isFinal: true, alternatives: [{ transcript: "late" }] }] });
  stream.write(Buffer.alloc(10));
  assert.equal(events.length, 1);
  assert.equal(writes.length, 2);
});
test("Google graceful finish retains final response and deduplicates only identical result offset", async () => {
  const events: Event[] = [];
  let ended = false,
    cancelled = false;
  const transport = Object.assign(new EventEmitter(), {
    write() {
      return true;
    },
    end() {
      ended = true;
      const result = {
        results: [
          {
            resultEndOffset: { seconds: 2, nanos: 1 },
            isFinal: true,
            alternatives: [{ transcript: "末尾の発言" }],
          },
        ],
      };
      transport.emit("data", result);
      transport.emit("data", result);
      transport.emit("end");
    },
    cancel() {
      cancelled = true;
    },
    destroy() {},
  });
  const adapter = new GoogleSpeech("test-project", "us", "chirp_3", {
    _streamingRecognize() {
      return transport;
    },
  } as unknown as NonNullable<ConstructorParameters<typeof GoogleSpeech>[3]>);
  const stream = adapter.open("interviewer", (e) => events.push(e));
  await stream.finish();
  assert.equal(ended, true);
  assert.equal(cancelled, false);
  assert.equal(events.length, 1);
  assert.equal((events[0] as Extract<Event, { type: "transcript" }>).text, "末尾の発言");
  stream.close();
  assert.equal(cancelled, true);
});
