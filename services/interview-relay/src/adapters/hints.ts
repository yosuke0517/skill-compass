import { GoogleAuth } from "google-auth-library";
import { hintInstruction, hintLines, type Turn, type HintAdapter } from "../shared.js";
export class MockHints implements HintAdapter {
  async generate(_turns: Turn[], signal: AbortSignal) {
    signal.throwIfAborted();
    return [
      "質問の確認観点を整理する",
      "自分が実際に経験した例を選ぶ",
      "結論・行動・結果の順で話す",
    ];
  }
}
// Conservatively bound the entire prompt in UTF-8 bytes, not only character count.
export function boundedContext(turns: Turn[]) {
  const copy = turns.slice(-6).map((t) => ({ ...t, text: t.text.slice(-500) }));
  while (Buffer.byteLength(hintInstruction + JSON.stringify(copy), "utf8") > 1800 && copy.length) {
    if (copy.length > 1) copy.shift();
    else copy[0].text = copy[0].text.slice(20);
  }
  return copy;
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
  async generate(turns: Turn[], signal: AbortSignal) {
    const token = await this.token();
    signal.throwIfAborted();
    const result = await this.request(
      `https://aiplatform.googleapis.com/v1/projects/${this.project}/locations/global/publishers/google/models/${this.model}:generateContent`,
      {
        method: "POST",
        redirect: "error",
        signal,
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: hintInstruction }] },
          contents: [{ role: "user", parts: [{ text: JSON.stringify(boundedContext(turns)) }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 512 },
        }),
      },
    );
    if (!result.ok) throw new Error("ヒント生成に失敗しました。");
    const reader = result.body?.getReader();
    let body = "";
    const decoder = new TextDecoder();
    if (!reader) throw new Error("Empty response");
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        body += decoder.decode(part.value, { stream: true });
        if (body.length > 65_536) {
          await reader.cancel();
          throw new Error("Response too large");
        }
      }
    } finally {
      reader.releaseLock();
    }
    const value = JSON.parse(body);
    return hintLines(
      value.candidates?.[0]?.content?.parts
        ?.filter((p: { thought?: boolean }) => !p.thought)
        .map((p: { text?: string }) => p.text ?? "")
        .join("\n") ?? "",
    );
  }
}
