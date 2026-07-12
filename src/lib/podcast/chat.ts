import type { PodcastScript } from "@/lib/podcast/script-generator";

export type PodcastChatMessage = { role: "user" | "assistant"; text: string };

type FetchLike = (url: string, init: { method: "POST"; headers: Record<string, string>; body: string }) => Promise<Response>;

export async function askPodcastChat(options: {
  apiKey: string | undefined;
  model: string;
  episodeTitle: string;
  script: PodcastScript | null;
  sources: Array<{ title: string; url: string }>;
  conversation: PodcastChatMessage[];
  question: string;
  fetch?: FetchLike;
}): Promise<{ answer: string; provider: string }> {
  if (!options.apiKey) throw new Error("podcast_chat_api_key_missing");
  const fetchJson = options.fetch ?? fetch;
  const context = options.script?.speakers.map((line) => `${line.speaker}: ${line.text}`).join("\n") ?? "台本はありません。SourceのURLとタイトルだけを使ってください。";
  const sourceContext = options.sources.map((source) => `${source.title}: ${source.url}`).join("\n") || "Sourceなし";
  const conversation = options.conversation.slice(-10).map((message) => `${message.role === "user" ? "User" : "Assistant"}: ${message.text}`).join("\n") || "なし";
  const response = await fetchJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(options.model)}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": options.apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: [
          "あなたはSkill Compass Podcastの学習コーチです。",
          "Podcastの台本とSourceを根拠に、日本語で具体的に回答してください。",
          "ユーザーがユースケースを求めたら、実際のシステム構成、入力、処理、結果、注意点まで説明してください。",
          "サンプルコードを求めたら、短く動作の意図が分かるコードと、どこを変更すべきかを示してください。",
          "台本やSourceにない事実は断定せず、推測であることを明示してください。一般論だけで終わらせないでください。",
          `Episode: ${options.episodeTitle}`,
          `Sources:\n${sourceContext}`,
          `Transcript:\n${context}`,
          `Conversation:\n${conversation}`,
          `User question:\n${options.question}`,
        ].join("\n\n") }] }],
        generationConfig: { temperature: 0.35, maxOutputTokens: 900 },
      }),
    },
  );
  if (!response.ok) throw new Error("podcast_chat_request_failed");
  const payload = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const answer = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!answer) throw new Error("podcast_chat_empty");
  return { answer, provider: "gemini" };
}
