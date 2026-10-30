import { GoogleAuth } from "google-auth-library";
import {
  hintInstruction,
  hintLines,
  promptVersion,
  type HintTrace,
  type Turn,
  type HintAdapter,
} from "../shared.js";
export class MockHints implements HintAdapter {
  async generate(turns: Turn[], signal: AbortSignal, trace?: (value: HintTrace) => Promise<void>) {
    signal.throwIfAborted();
    if (trace)
      await trace({
        request: {
          model: "mock-no-provider",
          promptVersion,
          body: {
            systemInstruction: { parts: [{ text: hintInstruction }] },
            contents: [{ role: "user", parts: [{ text: JSON.stringify(boundedContext(turns)) }] }],
            generationConfig: hintGenerationConfig,
          },
        },
      });
    const lines = [
      "質問の確認観点を整理する",
      "自分が実際に経験した例を選ぶ",
      "結論・行動・結果の順で話す",
    ];
    if (trace) await trace({ output: JSON.stringify({ lines }) });
    signal.throwIfAborted();
    return lines;
  }
}
export const hintGenerationConfig = {
  temperature: 0.2,
  maxOutputTokens: 512,
  responseMimeType: "application/json",
  responseSchema: {
    type: "OBJECT",
    properties: { lines: { type: "ARRAY", minItems: 2, maxItems: 3,
      items: { type: "STRING", description: "最新の質問だけへの確認観点。60文字以内、改行なし。" } } },
    required: ["lines"],
  },
};
// Conservatively bound the entire prompt in UTF-8 bytes, not only character count.
export function boundedContext(turns: Turn[]) {
  const copy = turns.slice(-6).map((t) => ({ ...t, text: t.text.slice(-500) }));
  const input = () => ({ latestUtterance: copy.at(-1) ?? null, immediatelyPrecedingUtterance: copy.at(-2) ?? null, olderContext: copy.slice(0, -2) });
  while (Buffer.byteLength(hintInstruction + JSON.stringify(input()), "utf8") > 1800 && copy.length) {
    if (copy.length > 1) copy.shift();
    else copy[0].text = copy[0].text.slice(20);
  }
  return input();
}
const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
export class VertexHints implements HintAdapter {
  constructor(
    private project: string,
    private model: string,
    private token = () => auth.getAccessToken(),
    private request: typeof fetch = fetch,
  ) {
    if (!/^[a-z][a-z0-9-]{4,62}$/.test(project) || !/^gemini-[a-z0-9.-]+$/.test(model))
      throw new Error("Invalid model config");
  }
  async generate(turns: Turn[], signal: AbortSignal, trace?: (value: HintTrace) => Promise<void>) {
    const token = await this.token();
    signal.throwIfAborted();
    const body = {
      systemInstruction: { parts: [{ text: hintInstruction }] },
      contents: [{ role: "user", parts: [{ text: JSON.stringify(boundedContext(turns)) }] }],
      generationConfig: hintGenerationConfig,
    };
    if (trace) await trace({ request: { model: this.model, promptVersion, body } });
    signal.throwIfAborted();
    const result = await this.request(
      `https://aiplatform.googleapis.com/v1/projects/${this.project}/locations/global/publishers/google/models/${this.model}:generateContent`,
      {
        method: "POST",
        redirect: "error",
        signal,
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (!result.ok) throw new Error("ヒント生成に失敗しました。");
    const reader = result.body?.getReader();
    let responseBody = "";
    const decoder = new TextDecoder();
    if (!reader) throw new Error("Empty response");
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        responseBody += decoder.decode(part.value, { stream: true });
        if (responseBody.length > 65_536) {
          await reader.cancel();
          throw new Error("Response too large");
        }
      }
    } finally {
      reader.releaseLock();
    }
    const value = JSON.parse(responseBody);
    const output =
      value.candidates?.[0]?.content?.parts
        ?.filter((p: { thought?: boolean }) => !p.thought)
        .map((p: { text?: string }) => p.text ?? "")
        .join("\n") ?? "";
    if (trace) await trace({ output });
    return hintLines(output);
  }
}
