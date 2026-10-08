import { test } from "node:test";
import assert from "node:assert/strict";
import { MockSpeech } from "../src/adapters/mock-speech.js";
import type { Event } from "../src/shared.js";
test("fake audio emits an explicitly labeled interim/final, then suppresses events after close", () => {
  const events: Event[] = [];
  const stream = new MockSpeech().open("interviewer", (e) => events.push(e));
  for (let i = 0; i < 10; i++) stream.write();
  assert.equal(events.length, 2);
  assert.equal(events[0].type, "transcript");
  assert.ok(events.every((e) => e.type === "transcript" && e.text.includes("サンプル")));
  stream.close();
  stream.write();
  assert.equal(events.length, 2);
});
