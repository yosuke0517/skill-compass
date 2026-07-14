import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";

import { podcastEpisodes, podcastJobs, podcastSettings } from "@/db/schema";
import { createMySqlPodcastJobQueue } from "@/lib/podcast/mysql-job-queue";
import type { PodcastSettings } from "@/lib/podcast/types";
import type { PodcastSourceSetting } from "@/lib/podcast/types";

export function isPodcastGenerationDue(
  frequency: PodcastSettings["generationFrequency"],
  localDate: string,
  lastGeneratedDate?: string,
): boolean {
  if (frequency === "manual" || lastGeneratedDate === localDate) return false;
  if (!lastGeneratedDate) return frequency !== "weekdays" || isWeekday(localDate);
  const elapsedDays = Math.floor((Date.parse(`${localDate}T00:00:00Z`) - Date.parse(`${lastGeneratedDate}T00:00:00Z`)) / 86_400_000);
  if (elapsedDays < 0) return false;
  if (frequency === "daily") return elapsedDays >= 1;
  if (frequency === "weekdays") return isWeekday(localDate);
  return elapsedDays >= 7;
}

export function isPodcastSourceDue(
  frequency: PodcastSourceSetting["frequency"],
  localDate: string,
  lastCollectedDate?: string,
): boolean {
  if (!lastCollectedDate) return true;
  const elapsedDays = Math.floor((Date.parse(`${localDate}T00:00:00Z`) - Date.parse(`${lastCollectedDate}T00:00:00Z`)) / 86_400_000);
  if (elapsedDays < 0) return false;
  if (frequency === "monthly") return localDate.slice(0, 7) !== lastCollectedDate.slice(0, 7);
  const minimumDays = { daily: 1, every_3_days: 3, weekly: 7, every_14_days: 14 }[frequency];
  return elapsedDays >= minimumDays;
}

export function localDateKey(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export async function enqueueDuePodcastGenerations(now = new Date()): Promise<number> {
  const { db } = await import("@/db/client");
  const rows = await db.select().from(podcastSettings);
  const queue = createMySqlPodcastJobQueue();
  let enqueued = 0;

  for (const settings of rows) {
    const frequency = settings.generationFrequency as PodcastSettings["generationFrequency"];
    const date = localDateKey(now, settings.timezone);
    const [latest] = await db.select({ localDate: podcastEpisodes.localDate })
      .from(podcastEpisodes)
      .where(and(eq(podcastEpisodes.userId, settings.userId), eq(podcastEpisodes.language, settings.language)))
      .orderBy(desc(podcastEpisodes.localDate)).limit(1);
    const lastDate = latest?.localDate ? toDateKey(latest.localDate) : undefined;
    if (!isPodcastGenerationDue(frequency, date, lastDate)) continue;

    const idempotencyKey = `podcast:scheduled:${settings.userId}:${date}:${settings.language}`;
    const [existing] = await db.select({ id: podcastJobs.id }).from(podcastJobs).where(eq(podcastJobs.idempotencyKey, idempotencyKey)).limit(1);
    if (existing) continue;

    const episodeId = `podcast_episode_${randomUUID()}`;
    await db.insert(podcastEpisodes).values({
      id: episodeId,
      userId: settings.userId,
      localDate: new Date(`${date}T00:00:00.000Z`),
      title: `Skill Compass briefing - ${date}`,
      language: settings.language,
      status: "queued",
      sourceSnapshot: [],
    });
    await queue.enqueue({ episodeId, userId: settings.userId, idempotencyKey, now });
    enqueued += 1;
  }

  return enqueued;
}

function weekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function isWeekday(date: string): boolean {
  const day = weekday(date);
  return day >= 1 && day <= 5;
}

function toDateKey(value: string | Date): string {
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}
