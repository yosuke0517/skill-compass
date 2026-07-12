import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db/client";
import { podcastChatMessages, podcastEpisodes } from "@/db/schema";
import { requireCurrentUser } from "@/lib/access/current-user";
import { getEnv } from "@/lib/env";
import { askPodcastChat, type PodcastChatMessage } from "@/lib/podcast/chat";
import { createKeychainApiKeyResolver } from "@/lib/translation/providers/gemini-provider";
import { createGeminiSpeechSynthesizer } from "@/lib/podcast/providers/gemini-speech-synthesizer";

const maxMessageLength = 1200;

export async function GET(_request: Request, context: { params: Promise<{ episodeId: string }> }) {
  const user = await requireCurrentUser();
  if (!user.entitlements.has("podcast.chat")) return NextResponse.json({ error: "Pro feature" }, { status: 403 });
  const { episodeId } = await context.params;
  const messages = await db.select({ role: podcastChatMessages.role, text: podcastChatMessages.text }).from(podcastChatMessages)
    .where(and(eq(podcastChatMessages.episodeId, episodeId), eq(podcastChatMessages.userId, user.id)))
    .orderBy(asc(podcastChatMessages.createdAt)).limit(40);
  return NextResponse.json({ messages: messages.filter((message): message is PodcastChatMessage => message.role === "user" || message.role === "assistant") });
}

export async function POST(request: Request, context: { params: Promise<{ episodeId: string }> }) {
  const user = await requireCurrentUser();
  if (!user.entitlements.has("podcast.chat")) return NextResponse.json({ error: "Pro feature" }, { status: 403 });
  const { episodeId } = await context.params;
  const body = (await request.json().catch(() => null)) as { question?: unknown; conversation?: unknown; voice?: unknown } | null;
  const question = typeof body?.question === "string" ? body.question.trim().slice(0, maxMessageLength) : "";
  if (!question) return NextResponse.json({ error: "question is required" }, { status: 400 });
  const [episode] = await db.select().from(podcastEpisodes).where(and(eq(podcastEpisodes.id, episodeId), eq(podcastEpisodes.userId, user.id))).limit(1);
  if (!episode) return NextResponse.json({ error: "Episode not found" }, { status: 404 });
  const conversation = parseConversation(body?.conversation);
  const env = getEnv();
  const apiKey = env.GEMINI_API_KEY_SOURCE === "keychain" && env.GEMINI_KEYCHAIN_SERVICE
    ? await createKeychainApiKeyResolver({ service: env.GEMINI_KEYCHAIN_SERVICE, account: env.GEMINI_KEYCHAIN_ACCOUNT })()
    : env.GEMINI_API_KEY;
  try {
    const result = await askPodcastChat({ apiKey, model: env.GEMINI_ASSISTANT_MODEL, episodeTitle: episode.title, script: episode.script, sources: episode.sourceSnapshot, conversation, question });
    await db.insert(podcastChatMessages).values([
      { id: `podcast_chat_${randomUUID()}`, episodeId, userId: user.id, role: "user", text: question, provider: null },
      { id: `podcast_chat_${randomUUID()}`, episodeId, userId: user.id, role: "assistant", text: result.answer, provider: result.provider },
    ]);
    let audioDataUrl: string | undefined;
    if (body?.voice === true) {
      const speech = await createGeminiSpeechSynthesizer({ apiKey, model: env.GEMINI_TTS_MODEL }).synthesize({ script: { language: episode.language === "en" ? "en" : "ja", speakers: [{ speaker: "host_b", text: result.answer }] }, durationMinutes: 1 });
      if (speech.status === "ready") audioDataUrl = `data:${speech.mimeType};base64,${speech.audio.toString("base64")}`;
    }
    return NextResponse.json({ answer: result.answer, provider: result.provider, audioDataUrl });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Podcast chat failed" }, { status: 503 });
  }
}

function parseConversation(value: unknown): PodcastChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (!item || typeof item !== "object") return null;
    const role = "role" in item ? item.role : null;
    const text = "text" in item && typeof item.text === "string" ? item.text.trim().slice(0, maxMessageLength) : "";
    return (role === "user" || role === "assistant") && text ? { role, text } satisfies PodcastChatMessage : null;
  }).filter((item): item is PodcastChatMessage => item !== null).slice(-10);
}
