import { boundedContext } from "./hints.js";
import { hintInstruction, hintLines, promptVersion, type HintAdapter, type HintTrace, type Turn } from "../shared.js";

export class OpenAIHints implements HintAdapter {
  constructor(private key: string, private model = "gpt-4.1-mini", private request: typeof fetch = fetch) {
    if (!key.trim() || !/^[a-zA-Z0-9._-]+$/.test(model)) throw new Error("OpenAI設定を確認してください。");
  }
  async generate(turns: Turn[], signal: AbortSignal, trace?: (value: HintTrace) => Promise<void>) {
    signal.throwIfAborted();
    const body = {
      model: this.model,
      store: false,
      instructions: hintInstruction,
      input: JSON.stringify(boundedContext(turns)),
      max_output_tokens: 512,
      text: { format: { type: "json_schema", name: "interview_hints", strict: true,
        schema: { type: "object", additionalProperties: false, required: ["lines"],
          properties: { lines: { type: "array", minItems: 2, maxItems: 3,
            items: { type: "string", maxLength: 60 } } } } } },
    };
    await trace?.({ request: { model: this.model, promptVersion, body } });
    signal.throwIfAborted();
    const response = await this.request("https://api.openai.com/v1/responses", {
      method: "POST", redirect: "error", signal,
      headers: { authorization: `Bearer ${this.key}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("OpenAIヒント生成に失敗しました。設定・利用枠を確認してください。");
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error("ヒント応答がありません。");
    const chunks: Uint8Array[] = []; let bytes = 0;
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 65536) { await reader.cancel(); throw new Error("ヒント応答が大きすぎます。"); }
        chunks.push(part.value);
      }
    } finally { reader.releaseLock(); }
    signal.throwIfAborted();
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (value.status !== "completed" || !Array.isArray(value.output)) throw new Error("ヒント生成が完了しませんでした。");
    const output = value.output.filter((item: { type: string }) => item.type === "message")
      .flatMap((item: { content?: Array<{ type: string; text?: string }> }) => item.content ?? [])
      .filter((part: { type: string }) => part.type === "output_text")
      .map((part: { text?: string }) => part.text ?? "").join("");
    await trace?.({ output });
    signal.throwIfAborted();
    return hintLines(output);
  }
}
