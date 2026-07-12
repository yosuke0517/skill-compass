import type { SpeechSynthesizer } from "@/lib/podcast/speech-synthesizer";

type FetchLike = (url: string, init: { method: "POST"; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<Response>;

export function createGeminiSpeechSynthesizer(options: {
  apiKey: string | undefined;
  model: string;
  fetch?: FetchLike;
}): SpeechSynthesizer {
  const fetchJson = options.fetch ?? fetch;
  return {
    async synthesize(input) {
      if (!options.apiKey) return { status: "unavailable", provider: "gemini", reason: "Gemini TTS API key is not configured." };
      const transcript = input.script.speakers.map((line) => `${line.speaker}: ${line.text}`).join("\n");
      try {
        const response = await fetchJson(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(options.model)}:generateContent`,
          {
            method: "POST",
            headers: { "content-type": "application/json", "x-goog-api-key": options.apiKey },
            signal: AbortSignal.timeout(90000),
            body: JSON.stringify({
              contents: [{ parts: [{ text: [
                "Synthesize this short two-speaker podcast dialogue as natural speech.",
                "Speak every provided line exactly once, in the provided order.",
                "Do not repeat, paraphrase, summarize, improvise, or stretch any line.",
                "This is a small audio chunk, so finish after the final provided line.",
                `Language: ${input.script.language}.`,
                "Dialogue:",
                transcript,
              ].join("\n") }] }],
              generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: { multiSpeakerVoiceConfig: { speakerVoiceConfigs: [{ speaker: "host_a", voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } }, { speaker: "host_b", voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } } }] } },
              },
            }),
          },
        );
        if (!response.ok) return { status: "unavailable", provider: "gemini", reason: "Gemini TTS request failed." };
        const payload = (await response.json()) as GeminiResponse;
        const inlineData = payload.candidates?.[0]?.content?.parts?.find((part) => part.inlineData)?.inlineData;
        if (!inlineData?.data) return { status: "unavailable", provider: "gemini", reason: "Gemini TTS returned no audio." };
        return { status: "ready", provider: "gemini", audio: pcmToWav(Buffer.from(inlineData.data, "base64")), mimeType: "audio/wav" };
      } catch {
        return { status: "unavailable", provider: "gemini", reason: "Gemini TTS request failed." };
      }
    },
  };
}

function pcmToWav(pcm: Buffer, sampleRate = 24000, channels = 1, bitsPerSample = 16): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + pcm.length, 4); header.write("WAVE", 8);
  header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * channels * bitsPerSample / 8, 28);
  header.writeUInt16LE(channels * bitsPerSample / 8, 32); header.writeUInt16LE(bitsPerSample, 34); header.write("data", 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> } }>;
};
