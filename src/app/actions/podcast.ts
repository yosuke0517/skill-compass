"use server";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db/client";
import { podcastEpisodes, podcastJobs, podcastSettings, sourcePodcastSettings, sources } from "@/db/schema";
import { requireCurrentUser } from "@/lib/access/current-user";
import { createMySqlPodcastJobQueue } from "@/lib/podcast/mysql-job-queue";
import { getPodcastSettings } from "@/lib/podcast/settings";

const frequencyValues = new Set(["daily", "weekdays", "weekly", "manual"]);
const sourceFrequencyValues = new Set(["daily", "every_3_days", "weekly", "every_14_days", "monthly"]);
const languageValues = new Set(["ja", "en"]);

export async function savePodcastSettingsAction(formData: FormData) {
  const user = await requireCurrentUser();
  if (!user.entitlements.has("podcast.generate")) redirect("/podcast?error=pro-required");

  const generationFrequency = String(formData.get("generationFrequency") ?? "daily");
  const timezone = String(formData.get("timezone") ?? "Asia/Tokyo");
  const durationMinutes = Number(formData.get("durationMinutes") ?? 10);
  const language = String(formData.get("language") ?? "ja");
  if (!frequencyValues.has(generationFrequency) || !languageValues.has(language) || !Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 30) {
    redirect("/podcast/settings?error=invalid-input");
  }

  const sourceRows = await db.select({ id: sources.id }).from(sources);
  await db.insert(podcastSettings).values({
    userId: user.id,
    generationFrequency,
    timezone: timezone.slice(0, 64),
    durationMinutes,
    language,
    useSources: formData.get("useSources") === "on",
    includeNews: formData.get("includeNews") === "on",
    includeCalendar: formData.get("includeCalendar") === "on",
    includeXPublic: formData.get("includeXPublic") === "on",
    includeXPersonal: formData.get("includeXPersonal") === "on",
    calendarReadMode: "time_title",
  }).onDuplicateKeyUpdate({
    set: { generationFrequency, timezone: timezone.slice(0, 64), durationMinutes, language, useSources: formData.get("useSources") === "on", includeNews: formData.get("includeNews") === "on", includeCalendar: formData.get("includeCalendar") === "on", includeXPublic: formData.get("includeXPublic") === "on", includeXPersonal: formData.get("includeXPersonal") === "on" },
  });

  for (const source of sourceRows) {
    const frequency = String(formData.get(`sourceFrequency_${source.id}`) ?? "daily");
    if (!sourceFrequencyValues.has(frequency)) continue;
    await db.insert(sourcePodcastSettings).values({
      userId: user.id,
      sourceId: source.id,
      enabled: formData.get(`sourceEnabled_${source.id}`) === "on",
      frequency,
    }).onDuplicateKeyUpdate({ set: { enabled: formData.get(`sourceEnabled_${source.id}`) === "on", frequency } });
  }

  revalidatePath("/podcast");
  revalidatePath("/podcast/settings");
  redirect("/podcast/settings?saved=1");
}

export async function enqueuePodcastGenerationAction() {
  const user = await requireCurrentUser();
  if (!user.entitlements.has("podcast.generate")) redirect("/podcast?error=pro-required");

  const data = await getPodcastSettings(user.id);
  const localDate = new Date().toISOString().slice(0, 10);
  const idempotencyKey = `podcast:generate:${user.id}:${localDate}:${data.settings.language}`;
  const [existing] = await db.select({ jobId: podcastJobs.id }).from(podcastJobs).where(eq(podcastJobs.idempotencyKey, idempotencyKey)).limit(1);
  if (existing) redirect("/podcast?saved=already-queued");

  const episodeId = `podcast_episode_${randomUUID()}`;
  await db.insert(podcastEpisodes).values({
    id: episodeId,
    userId: user.id,
    localDate: new Date(`${localDate}T00:00:00.000Z`),
    title: `Skill Compass briefing - ${localDate}`,
    language: data.settings.language,
    status: "queued",
    sourceSnapshot: data.settings.useSources ? data.sources.filter((source) => source.enabled).map((source) => ({ id: source.id, title: source.title, url: source.url })) : [],
  });
  await createMySqlPodcastJobQueue().enqueue({ episodeId, userId: user.id, idempotencyKey });

  revalidatePath("/podcast");
  redirect("/podcast?saved=queued");
}

export async function retryPodcastJobAction(formData: FormData) {
  const user = await requireCurrentUser();
  const jobId = String(formData.get("jobId") ?? "");
  if (!jobId) redirect("/podcast");
  const [job] = await db.select().from(podcastJobs).where(eq(podcastJobs.id, jobId)).limit(1);
  if (!job || job.userId !== user.id || job.status !== "failed") redirect("/podcast?error=invalid-retry");
  await db.update(podcastJobs).set({ status: "queued", nextRunAt: new Date(), errorCode: null }).where(eq(podcastJobs.id, jobId));
  await db.update(podcastEpisodes).set({ status: "queued" }).where(eq(podcastEpisodes.id, job.episodeId));
  revalidatePath("/podcast");
  redirect("/podcast?saved=retry-queued");
}
