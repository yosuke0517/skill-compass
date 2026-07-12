import type { PodcastScript, ScriptGenerator } from "@/lib/podcast/script-generator";

type FetchLike = (url: string, init: { method: "POST"; headers: Record<string, string>; body: string }) => Promise<Response>;

export function createGeminiScriptGenerator(options: {
  apiKey: string | undefined;
  model: string;
  fetch?: FetchLike;
}): ScriptGenerator {
  const fetchJson = options.fetch ?? fetch;
  return {
    async generate(input) {
      if (!options.apiKey) throw new Error("script_generator_api_key_missing");
      if (input.sources.length === 0) return requestScriptWithRetry(fetchJson, options.apiKey, options.model, input, []);

      const perSourceMinutes = Math.max(2, input.durationMinutes / input.sources.length);
      const scripts = await Promise.all(input.sources.map((source) => requestScriptWithRetry(
        fetchJson,
        options.apiKey as string,
        options.model,
        { ...input, durationMinutes: perSourceMinutes, sources: [source] },
        [source.title],
      )));
      return { language: input.language, speakers: scripts.flatMap((script) => script.speakers) };
    },
  };
}

async function requestScriptWithRetry(
  fetchJson: FetchLike,
  apiKey: string,
  model: string,
  input: Parameters<ScriptGenerator["generate"]>[0],
  requiredTitles: string[],
): Promise<PodcastScript> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await requestScript(fetchJson, apiKey, model, input, requiredTitles);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("script_generator_failed");
}

async function requestScript(
  fetchJson: FetchLike,
  apiKey: string,
  model: string,
  input: Parameters<ScriptGenerator["generate"]>[0],
  requiredTitles: string[],
): Promise<PodcastScript> {
  const response = await fetchJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(input, requiredTitles) }] }],
        generationConfig: { temperature: 0.7, responseMimeType: "application/json" },
      }),
    },
  );
  if (!response.ok) throw new Error("script_generator_request_failed");
  const payload = (await response.json()) as GeminiResponse;
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!text) throw new Error("script_generator_empty");
  return parseScript(text, input.language, requiredTitles);
}

function buildPrompt(input: Parameters<ScriptGenerator["generate"]>[0], requiredTitles: string[]): string {
  const source = input.sources[0];
  const sourceText = input.sources.map((item) => [
    `SOURCE: ${item.title}`,
    `URL: ${item.url}`,
    `CONTENT: ${item.content ?? "本文を取得できませんでした。URLとタイトルから推測せず、確認できない事実として扱ってください。"}`,
  ].join("\n")).join("\n\n");
  return [
    "あなたはソフトウェアエンジニア向けPodcastの編集者です。",
    `今回は「${source?.title ?? "指定されたテーマ"}」だけを扱う短い2人の会話を作ります。`,
    "提供されたソース本文だけを根拠に、具体的で検証可能な内容にしてください。",
    "一般論、空疎な相づち、同じ結論の反復、ソースにない事実の創作は禁止です。",
    "本文中のAPI名、設定、コード上の挙動、制約、トレードオフを最低2つ取り上げてください。",
    "host_aは問いを立てて具体例を求め、host_bは本文に基づく挙動、反例、実務上の確認方法を返してください。",
    "発話は短く自然にし、同じ内容を言い換えて水増ししないでください。",
    `目標時間は約${input.durationMinutes.toFixed(1)}分、最低4発話です。`,
    `必須タイトル: ${requiredTitles.join(", ") || "なし"}。必須タイトルを発話本文にそのまま含めてください。`,
    `言語: ${input.language}。JSONだけを返してください。形式は {"language": "${input.language}", "speakers": [{"speaker": "host_a" または "host_b", "text": "..."}]} です。`,
    sourceText || "SOURCEがありません。確認できない具体的事実を作らず、確認のための質問を中心にしてください。",
  ].join("\n\n");
}

function parseScript(text: string, language: "ja" | "en", requiredTitles: string[]): PodcastScript {
  const normalized = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const parsed = JSON.parse(normalized) as Partial<PodcastScript>;
  if (!Array.isArray(parsed.speakers)) throw new Error("script_generator_invalid_script");
  const speakers = parsed.speakers.filter((line): line is { speaker: "host_a" | "host_b"; text: string } =>
    (line.speaker === "host_a" || line.speaker === "host_b") && typeof line.text === "string" && line.text.trim().length > 0,
  );
  if (speakers.length < 4) throw new Error("script_generator_script_too_short");
  const scriptText = speakers.map((line) => line.text).join(" ");
  if (requiredTitles.some((title) => !scriptText.includes(title))) throw new Error("script_generator_source_missing");
  return { language, speakers };
}

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
};
