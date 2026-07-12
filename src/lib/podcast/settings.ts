import { eq } from "drizzle-orm";

import { podcastSettings, sourcePodcastSettings, sources } from "@/db/schema";
import type { PodcastSettings, PodcastSourceSetting } from "@/lib/podcast/types";

export async function getPodcastSettings(userId: string): Promise<{ settings: PodcastSettings; sources: PodcastSourceSetting[] }> {
  const { db } = await import("@/db/client");
  const [settingsRow, sourceRows, sourceSettingsRows] = await Promise.all([
    db.select().from(podcastSettings).where(eq(podcastSettings.userId, userId)).limit(1),
    db.select({ id: sources.id, title: sources.title, url: sources.url, official: sources.official }).from(sources).orderBy(sources.title),
    db.select().from(sourcePodcastSettings).where(eq(sourcePodcastSettings.userId, userId)),
  ]);
  const row = settingsRow[0];
  const settings: PodcastSettings = {
    generationFrequency: (row?.generationFrequency as PodcastSettings["generationFrequency"] | undefined) ?? "daily",
    timezone: row?.timezone ?? "Asia/Tokyo",
    durationMinutes: row?.durationMinutes ?? 10,
    language: (row?.language as PodcastSettings["language"] | undefined) ?? "ja",
    useSources: row?.useSources ?? true,
    includeNews: row?.includeNews ?? true,
    includeCalendar: row?.includeCalendar ?? false,
    includeXPublic: row?.includeXPublic ?? false,
    includeXPersonal: row?.includeXPersonal ?? false,
    calendarReadMode: "time_title",
  };
  const sourceSettingById = new Map(sourceSettingsRows.map((item) => [item.sourceId, item]));
  return {
    settings,
    sources: sourceRows.map((source) => {
      const setting = sourceSettingById.get(source.id);
      return {
        id: source.id,
        title: source.title,
        url: source.url,
        official: source.official,
        enabled: setting?.enabled ?? true,
        frequency: (setting?.frequency as PodcastSourceSetting["frequency"] | undefined) ?? "daily",
      };
    }),
  };
}
