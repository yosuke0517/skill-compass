import { test } from "node:test";
import assert from "node:assert/strict";
import { boundedContext, VertexHints } from "../src/adapters/hints.js";
import { hintInstruction, hintLines, type Turn } from "../src/shared.js";

const turns: Turn[] = [
  { source: "interviewer", text: "自己紹介と担当範囲を教えてください。" },
  { source: "interviewer", text: "Next.jsの画面が遅い原因をどう切り分けますか？" },
  { source: "interviewer", text: "AIが生成したコードを採用する前にどの" },
  { source: "interviewer", text: "ような点を確認しますか？" },
];

test("latest split question is explicitly targeted with its preceding fragment preserved", async () => {
  let recorded: unknown;
  const lines = ["セキュリティとライセンスを確認する。", "動作テストと保守性を評価する。"];
  const adapter = new VertexHints("test-project", "gemini-test", async () => "fake", async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    const input = JSON.parse(body.contents[0].parts[0].text);
    assert.deepEqual(input.latestUtterance, turns[3]);
    assert.deepEqual(input.immediatelyPrecedingUtterance, turns[2]);
    assert.ok(input.olderContext.every((t: Turn) => t.text !== input.immediatelyPrecedingUtterance.text));
    assert.match(body.systemInstruction.parts[0].text, /過去の質問への助言を再掲しない/);
    assert.equal(body.generationConfig.responseMimeType, "application/json");
    assert.equal(body.generationConfig.responseSchema.properties.lines.maxItems, 3);
    assert.deepEqual(recorded, body);
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ lines }) }] } }] });
  });
  assert.deepEqual(await adapter.generate(turns, new AbortController().signal, async (trace) => {
    if (trace.request) recorded = trace.request.body;
  }), lines);
});

test("context trimming preserves newest utterance under the full prompt byte cap", () => {
  const input = boundedContext([...Array.from({ length: 10 }, () => ({ source: "interviewer" as const, text: "古い話".repeat(200) })), turns[2], turns[3]]);
  assert.deepEqual(input.latestUtterance, turns[3]);
  assert.deepEqual(input.immediatelyPrecedingUtterance, turns[2]);
  assert.ok(Buffer.byteLength(hintInstruction + JSON.stringify(input)) <= 1800);
});

test("extra questions cannot be silently sliced away from model output", () => {
  assert.throws(() => hintLines(JSON.stringify({ lines: ["過去1", "過去2", "過去3", "最新質問への助言"] })));
  assert.throws(() => hintLines(JSON.stringify({ lines: ["旧質問\n新質問", "確認事項"] })));
  assert.throws(() => hintLines(JSON.stringify({ lines: ["長".repeat(61), "確認事項"] })));
  assert.throws(() => hintLines("過去1\n過去2\n過去3\n最新質問への助言"));
  assert.deepEqual(hintLines(JSON.stringify({ lines: ["最新の観点", "確認する事項", "本人の経験"] })), ["最新の観点", "確認する事項", "本人の経験"]);
});

// Synthetic equivalent of the saved real-run failure: question 3's suffix was
// answered using question 2 even though its immediate AI-code fragment existed.
test("adjacent fragment is separated from an older completed question", () => {
  const input = boundedContext([
    { source: "interviewer", text: "第2問です。Next.jsで作った画面が遅いと相談されました。原因を" },
    { source: "interviewer", text: "どのように切り分け、何を確認しますか?" },
    { source: "interviewer", text: "第3問です。AIが生成したコードをプロジェクトに採用する前に" },
    { source: "interviewer", text: "にどのような点を確認しますか?" },
  ]);
  assert.match(input.immediatelyPrecedingUtterance!.text, /第3問.*AI/);
  assert.doesNotMatch(input.immediatelyPrecedingUtterance!.text, /Next/);
  assert.ok(input.olderContext.some((t) => t.text.includes("Next.js")));
  assert.match(hintInstruction, /質問が未完なら推測回答せず/);
  assert.match(hintInstruction, /案内・挨拶・終了通知/);
});
