import { and, asc, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { podcastAssets, podcastAudioChunks, podcastEpisodes, podcastJobs } from "@/db/schema";
import { createWebContentCollector } from "@/lib/podcast/content-collector";
import { getEnv } from "@/lib/env";
import { getAudioStorage } from "@/lib/podcast/audio-storage-provider";
import { createGeminiSpeechSynthesizer } from "@/lib/podcast/providers/gemini-speech-synthesizer";
import { createGeminiScriptGenerator } from "@/lib/podcast/providers/gemini-script-generator";
import { createKeychainApiKeyResolver } from "@/lib/translation/providers/gemini-provider";
import { getPodcastSettings } from "@/lib/podcast/settings";
import { createDeterministicScriptGenerator } from "@/lib/podcast/script-generator";
import { isPodcastSourceDue, localDateKey } from "@/lib/podcast/scheduler";
import { createPodcastContextCollector } from "@/lib/podcast/context-collector";
import { createRssNewsCollector } from "@/lib/podcast/news-collector";

export async function runPodcastWorkerOnce(now = new Date()): Promise<{ status: "idle" | "script_ready" | "audio_chunk_ready" | "audio_ready"; jobId?: string }> {
  const [job] = await db.select().from(podcastJobs)
    .where(and(eq(podcastJobs.status, "queued"), sql`${podcastJobs.nextRunAt} <= ${now}`))
    .orderBy(asc(podcastJobs.nextRunAt)).limit(1);
  if (job) return preparePodcastChunks(job, now);

  const [chunk] = await db.select().from(podcastAudioChunks)
    .where(eq(podcastAudioChunks.status, "queued"))
    .orderBy(asc(podcastAudioChunks.createdAt), asc(podcastAudioChunks.chunkIndex)).limit(1);
  if (!chunk) return { status: "idle" };
  return processPodcastChunk(chunk);
}

export async function drainPodcastWorker(maxSteps = 100, now = new Date()): Promise<{ steps: number; status: "idle" | "drained" | "limit" }> {
  let steps = 0;
  while (steps < maxSteps) {
    const result = await runPodcastWorkerOnce(now);
    if (result.status === "idle") return { steps, status: steps === 0 ? "idle" : "drained" };
    steps += 1;
  }
  return { steps, status: "limit" };
}

async function preparePodcastChunks(job: typeof podcastJobs.$inferSelect, now: Date) {
  await db.update(podcastJobs).set({ status: "running", attempts: job.attempts + 1 }).where(eq(podcastJobs.id, job.id));
  try {
    const settings = await getPodcastSettings(job.userId);
    const priorEpisodes = await db.select({ localDate: podcastEpisodes.localDate, sourceSnapshot: podcastEpisodes.sourceSnapshot })
      .from(podcastEpisodes).where(eq(podcastEpisodes.userId, job.userId)).orderBy(desc(podcastEpisodes.localDate)).limit(100);
    const localDate = localDateKey(now, settings.settings.timezone);
    const sources = settings.sources.map((source) => {
      const lastCollectedDate = priorEpisodes.find((episode) => episode.sourceSnapshot.some((item) => item.id === source.id))?.localDate;
      const lastDate = lastCollectedDate ? toDateKey(lastCollectedDate) : undefined;
      return { ...source, enabled: source.enabled && isPodcastSourceDue(source.frequency, localDate, lastDate) };
    });
    const collected = await createWebContentCollector({ now: () => now }).collect({
      useSources: settings.settings.useSources,
      sources: sources.map((source) => ({ id: source.id, title: source.title, url: source.url, enabled: source.enabled })),
    });
    const context = await createPodcastContextCollector().collect({
      now,
      includeCalendar: settings.settings.includeCalendar,
      includeXPublic: settings.settings.includeXPublic,
      includeXPersonal: settings.settings.includeXPersonal,
    });
    const env = getEnv();
    const news = await createRssNewsCollector({ feedUrls: env.PODCAST_NEWS_FEED_URLS.split(",").map((url) => url.trim()).filter(Boolean) }).collect({ now, enabled: settings.settings.includeNews });
    const allCollected = [...collected, ...news, ...context];
    const apiKey = env.GEMINI_API_KEY_SOURCE === "keychain" && env.GEMINI_KEYCHAIN_SERVICE
      ? await createKeychainApiKeyResolver({ service: env.GEMINI_KEYCHAIN_SERVICE, account: env.GEMINI_KEYCHAIN_ACCOUNT })()
      : env.GEMINI_API_KEY;
    const script = apiKey
      ? await createGeminiScriptGenerator({ apiKey, model: env.GEMINI_SCRIPT_MODEL }).generate({ language: settings.settings.language, durationMinutes: settings.settings.durationMinutes, sources: allCollected })
      : await createDeterministicScriptGenerator().generate({ language: settings.settings.language, durationMinutes: settings.settings.durationMinutes, sources: allCollected });
    const chunks = chunkScript(script.speakers, 2);
    await db.update(podcastEpisodes).set({ sourceSnapshot: allCollected.map((source) => ({ id: source.id, title: source.title, url: source.url })), script, status: "synthesizing" }).where(eq(podcastEpisodes.id, job.episodeId));
    await db.insert(podcastAudioChunks).values(chunks.map((_, chunkIndex) => ({ episodeId: job.episodeId, chunkIndex, status: "queued" }))).onDuplicateKeyUpdate({ set: { status: "queued", errorCode: null } });
    await db.update(podcastJobs).set({ status: "succeeded", errorCode: "audio_chunks_queued" }).where(eq(podcastJobs.id, job.id));
    return { status: "script_ready" as const, jobId: job.id };
  } catch {
    await db.update(podcastJobs).set({ status: "failed", errorCode: "script_generation_failed" }).where(eq(podcastJobs.id, job.id));
    await db.update(podcastEpisodes).set({ status: "failed" }).where(eq(podcastEpisodes.id, job.episodeId));
    throw new Error("Podcast worker failed to prepare audio chunks.");
  }
}

async function processPodcastChunk(chunk: typeof podcastAudioChunks.$inferSelect) {
  const claimed = await db.update(podcastAudioChunks)
    .set({ status: "running", attempts: sql`${podcastAudioChunks.attempts} + 1` })
    .where(and(eq(podcastAudioChunks.episodeId, chunk.episodeId), eq(podcastAudioChunks.chunkIndex, chunk.chunkIndex), eq(podcastAudioChunks.status, "queued")));
  if (claimed[0].affectedRows === 0) return { status: "idle" as const };

  try {
    const [episode] = await db.select().from(podcastEpisodes).where(eq(podcastEpisodes.id, chunk.episodeId)).limit(1);
    if (!episode?.script) throw new Error("script_missing");
    const settings = await getPodcastSettings(episode.userId);
    const env = getEnv();
    const apiKey = env.GEMINI_API_KEY_SOURCE === "keychain" && env.GEMINI_KEYCHAIN_SERVICE
      ? await createKeychainApiKeyResolver({ service: env.GEMINI_KEYCHAIN_SERVICE, account: env.GEMINI_KEYCHAIN_ACCOUNT })()
      : env.GEMINI_API_KEY;
    const speakers = episode.script.speakers.slice(chunk.chunkIndex * 2, chunk.chunkIndex * 2 + 2);
    const synthesis = await createGeminiSpeechSynthesizer({ apiKey, model: env.GEMINI_TTS_MODEL }).synthesize({ script: { language: episode.script.language, speakers }, durationMinutes: settings.settings.durationMinutes });
    if (synthesis.status === "unavailable") throw new Error("tts_unavailable");

    const storage = await getAudioStorage();
    const storageKey = `users/${episode.userId}/episodes/${episode.id}/chunks/${String(chunk.chunkIndex).padStart(3, "0")}.wav`;
    const stored = await storage.save({ key: storageKey, audio: synthesis.audio, mediaType: synthesis.mimeType });
    await db.update(podcastAudioChunks).set({ status: "ready", storageProvider: env.PODCAST_AUDIO_STORAGE, storageKey: stored.key, mediaType: stored.mediaType, sizeBytes: stored.sizeBytes, errorCode: null }).where(and(eq(podcastAudioChunks.episodeId, chunk.episodeId), eq(podcastAudioChunks.chunkIndex, chunk.chunkIndex)));

    const allChunks = await db.select().from(podcastAudioChunks).where(eq(podcastAudioChunks.episodeId, chunk.episodeId)).orderBy(asc(podcastAudioChunks.chunkIndex));
    if (!allChunks.every((item) => item.status === "ready" && item.storageKey)) return { status: "audio_chunk_ready" as const, jobId: chunk.episodeId };

    const audio = combineWavBuffers(await Promise.all(allChunks.map((item) => storage.read(item.storageKey as string))));
    const final = await storage.save({ key: `users/${episode.userId}/episodes/${episode.id}.wav`, audio, mediaType: "audio/wav" });
    await db.insert(podcastAssets).ignore().values({ id: `podcast_asset_${episode.id}`, episodeId: episode.id, userId: episode.userId, language: episode.language, storageProvider: env.PODCAST_AUDIO_STORAGE, storageKey: final.key, mediaType: final.mediaType, sizeBytes: final.sizeBytes, durationSeconds: getWavDurationSeconds(audio) });
    await db.update(podcastEpisodes).set({ status: "ready" }).where(eq(podcastEpisodes.id, episode.id));
    return { status: "audio_ready" as const, jobId: episode.id };
  } catch (error) {
    await db.update(podcastAudioChunks).set({ status: "failed", errorCode: error instanceof Error ? error.message.slice(0, 96) : "chunk_failed" }).where(and(eq(podcastAudioChunks.episodeId, chunk.episodeId), eq(podcastAudioChunks.chunkIndex, chunk.chunkIndex)));
    await db.update(podcastEpisodes).set({ status: "failed" }).where(eq(podcastEpisodes.id, chunk.episodeId));
    throw new Error("Podcast audio chunk failed.");
  }
}

function chunkScript<T>(speakers: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < speakers.length; index += size) chunks.push(speakers.slice(index, index + size));
  return chunks;
}

function combineWavBuffers(chunks: Buffer[]): Buffer {
  if (chunks.length === 1) return chunks[0];
  const pcm = Buffer.concat(chunks.map((chunk) => chunk.subarray(44)));
  const header = Buffer.from(chunks[0].subarray(0, 44));
  header.writeUInt32LE(36 + pcm.length, 4);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function getWavDurationSeconds(audio: Buffer): number | null {
  if (audio.length < 44 || audio.toString("ascii", 0, 4) !== "RIFF") return null;
  const byteRate = audio.readUInt32LE(28);
  return byteRate > 0 ? Math.round(audio.readUInt32LE(40) / byteRate) : null;
}

function toDateKey(value: string | Date): string {
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}
