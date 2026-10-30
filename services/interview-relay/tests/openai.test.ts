import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { OpenAIHints } from "../src/adapters/openai-hints.js";
import { OpenAISpeech } from "../src/adapters/openai-speech.js";
import type { Event, HintTrace } from "../src/shared.js";

test("OpenAI hints preserve structured lines and bounded history without recording credentials", async () => {
  const traces: HintTrace[] = [];
  const hints = new OpenAIHints("test-secret", "gpt-4.1-mini", async (url, init) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-secret");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.store, false);
    assert.equal(body.text.format.strict, true);
    assert.equal(body.max_output_tokens, 512);
    assert.ok(Buffer.byteLength(body.instructions + body.input) <= 1800);
    assert.equal(JSON.parse(body.input).latestUtterance.text, "最新の質問");
    return Response.json({ status: "completed", output: [{ type: "message", content: [
      { type: "output_text", text: '{"lines":["対象を確認する","経験から構成を考える"]}' },
    ] }] });
  });
  const lines = await hints.generate([{ source: "interviewer", text: "古い質問".repeat(500) },
    { source: "interviewer", text: "最新の質問" }], new AbortController().signal, async t => { traces.push(t); });
  assert.deepEqual(lines, ["対象を確認する", "経験から構成を考える"]);
  assert.equal(traces[0].request?.model, "gpt-4.1-mini");
  assert.ok(!JSON.stringify(traces).includes("test-secret"));
});

test("OpenAI rejects HTTP errors, incomplete/refused/oversized replies and aborts before submission", async () => {
  for (const response of [new Response("secret diagnostic", { status: 401 }),
    Response.json({ status: "incomplete", output: [] }),
    Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }] }),
    new Response("x".repeat(70000))]) {
    await assert.rejects(new OpenAIHints("key", "gpt-4.1-mini", async () => response)
      .generate([], new AbortController().signal));
  }
  let called = false;
  const controller = new AbortController(); controller.abort();
  await assert.rejects(new OpenAIHints("key", "gpt-4.1-mini", async () => { called = true; return Response.json({}); })
    .generate([], controller.signal));
  assert.equal(called, false);
});

class Socket extends EventEmitter {
  readyState: 0 | 1 | 2 | 3 = 1;
  bufferedAmount = 0;
  sent: Array<{ type: string; audio: string; session: { audio: { input: { transcription: { model: string }; turn_detection: null } } } }> = [];
  send(value: string) { this.sent.push(JSON.parse(value)); }
  terminate() { this.readyState = 3; }
  event(value: object) { this.emit("message", Buffer.from(JSON.stringify(value))); }
}
function setup() {
  const socket = new Socket(), events: Event[] = [];
  const stream = new OpenAISpeech("key", () => socket).open("interviewer", e => events.push(e));
  socket.emit("open");
  socket.event({ type: "session.updated" });
  return { socket, events, stream };
}
const voiced = () => { const b = Buffer.alloc(3200); for (let i = 0; i < 1600; i++) b.writeInt16LE(i % 2 ? 3000 : -3000, i * 2); return b; };
function turn(stream: ReturnType<typeof setup>["stream"]) {
  stream.write(voiced());
  for (let i = 0; i < 6; i++) stream.write(Buffer.alloc(3200));
}
test("speech converts PCM16 16kHz to 24kHz and commits only after speech plus silence", () => {
  const { socket, stream } = setup();
  try {
    assert.equal(socket.sent[0].session.audio.input.transcription.model, "gpt-live-transcribe");
    assert.equal(socket.sent[0].session.audio.input.turn_detection, null);
    stream.write(Buffer.alloc(3200));
    assert.equal(socket.sent.length, 1);
    turn(stream);
    const append = socket.sent.find(e => e.type === "input_audio_buffer.append")!;
    assert.equal(Buffer.from(append.audio, "base64").length, 4800);
    assert.equal(socket.sent.filter(e => e.type === "input_audio_buffer.commit").length, 1);
  } finally { stream.close(); }
});
test("out-of-order completions are emitted in committed order once; finish drains final text", async () => {
  const { socket, stream, events } = setup();
  try {
    turn(stream); turn(stream);
    socket.event({ type: "input_audio_buffer.committed", item_id: "a", previous_item_id: null });
    socket.event({ type: "input_audio_buffer.committed", item_id: "b", previous_item_id: "a" });
    socket.event({ type: "conversation.item.input_audio_transcription.completed", item_id: "b", transcript: "次の質問" });
    assert.equal(events.filter(e => e.type === "transcript" && e.final).length, 0);
    const finishing = stream.finish!();
    socket.event({ type: "conversation.item.input_audio_transcription.completed", item_id: "a", transcript: "最初の質問" });
    await finishing;
    socket.event({ type: "conversation.item.input_audio_transcription.completed", item_id: "b", transcript: "重複" });
    assert.deepEqual(events.filter(e => e.type === "transcript" && e.final).map(e => e.type === "transcript" && e.text), ["最初の質問", "次の質問"]);
  } finally { stream.close(); }
});
test("transport error closes upstream and suppresses later transcript events", () => {
  const { socket, stream, events } = setup();
  socket.event({ type: "error", error: { message: "secret provider response" } });
  socket.event({ type: "conversation.item.input_audio_transcription.delta", item_id: "a", delta: "late" });
  assert.equal(socket.readyState, 3);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "error");
  assert.ok(!JSON.stringify(events).includes("secret"));
  stream.close();
});
test("more than 256 short turns stay connected until scheduled rotation", () => {
  const { socket, stream, events } = setup();
  try {
    for (let n = 0; n < 300; n++) {
      turn(stream);
      socket.event({ type: "input_audio_buffer.committed", item_id: `item-${n}` });
      socket.event({ type: "conversation.item.input_audio_transcription.completed", item_id: `item-${n}`, transcript: `質問${n}` });
    }
    assert.equal(socket.readyState, 1);
    assert.equal(events.filter(e => e.type === "transcript" && e.final).length, 300);
    assert.equal(events.filter(e => e.type === "error").length, 0);
  } finally { stream.close(); }
});
test("finish before initialization flushes queued audio and drains its final", async () => {
  const socket = new Socket(), events: Event[] = [];
  const stream = new OpenAISpeech("key", () => socket).open("interviewer", e => events.push(e));
  stream.write(voiced());
  const finished = stream.finish!();
  socket.emit("open"); socket.event({ type: "session.updated" });
  assert.equal(socket.sent.filter(e => e.type === "input_audio_buffer.commit").length, 1);
  socket.event({ type: "input_audio_buffer.committed", item_id: "last" });
  socket.event({ type: "conversation.item.input_audio_transcription.completed", item_id: "last", transcript: "最後" });
  await finished;
  assert.equal(events.filter(e => e.type === "transcript" && e.final).length, 1);
  assert.equal(socket.readyState, 3);
});
test("continuous speech commits at 15 seconds; close suppresses pending final", async () => {
  const { socket, stream, events } = setup();
  for (let n = 0; n < 150; n++) stream.write(voiced());
  assert.equal(socket.sent.filter(e => e.type === "input_audio_buffer.commit").length, 1);
  const finished = stream.finish!(); stream.close(); await finished;
  socket.event({ type: "conversation.item.input_audio_transcription.completed", item_id: "late", transcript: "late" });
  assert.equal(events.length, 0);
});
test("bounded startup queue, send backlog and drain deadline fail closed", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const socket = new Socket(), events: Event[] = [];
  const stream = new OpenAISpeech("key", () => socket).open("interviewer", e => events.push(e));
  for (let i = 0; i < 21; i++) stream.write(voiced());
  assert.equal(socket.readyState, 3);
  stream.close();
  const a = setup(); a.socket.bufferedAmount = 200000; a.stream.write(voiced());
  assert.equal(a.socket.readyState, 3); a.stream.close();
  const b = setup(); turn(b.stream); const done = b.stream.finish!();
  const rejected = assert.rejects(done); t.mock.timers.tick(10001); await rejected;
  assert.equal(b.socket.readyState, 3); b.stream.close();
});
