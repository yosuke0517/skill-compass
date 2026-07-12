import { describe, expect, it } from "vitest";
import { createGeminiSpeechSynthesizer } from "@/lib/podcast/providers/gemini-speech-synthesizer";

describe("Gemini speech synthesizer boundary", () => {
  it("does not call a provider without an API key", async () => {
    const provider = createGeminiSpeechSynthesizer({ apiKey: undefined, model: "preview-model" });
    await expect(provider.synthesize({ script: { language: "ja", speakers: [] }, durationMinutes: 10 })).resolves.toMatchObject({ status: "unavailable", provider: "gemini" });
  });

  it("instructs the provider to speak each chunk once without repetition", async () => {
    let requestBody = "";
    const provider = createGeminiSpeechSynthesizer({
      apiKey: "test-key",
      model: "preview-model",
      fetch: async (_url, init) => {
        requestBody = init.body;
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { data: Buffer.alloc(48).toString("base64") } }] } }] }), { status: 200 });
      },
    });

    await provider.synthesize({
      script: { language: "ja", speakers: [{ speaker: "host_a", text: "一つ目" }, { speaker: "host_b", text: "二つ目" }] },
      durationMinutes: 10,
    });

    expect(requestBody).toContain("Speak every provided line exactly once");
    expect(requestBody).toContain("Do not repeat, paraphrase, summarize, improvise, or stretch any line");
  });
});
