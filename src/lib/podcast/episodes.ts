import { desc, eq } from "drizzle-orm";

import { podcastAssets, podcastEpisodes, podcastJobs } from "@/db/schema";

export async function getPodcastEpisodes(userId: string) {
  const { db } = await import("@/db/client");
  const [episodes, jobs, assets] = await Promise.all([
    db.select().from(podcastEpisodes).where(eq(podcastEpisodes.userId, userId)).orderBy(desc(podcastEpisodes.createdAt)).limit(20),
    db.select().from(podcastJobs).where(eq(podcastJobs.userId, userId)).orderBy(desc(podcastJobs.createdAt)).limit(20),
    db.select().from(podcastAssets).where(eq(podcastAssets.userId, userId)).orderBy(desc(podcastAssets.createdAt)).limit(20),
  ]);
  return { episodes, jobs, assets };
}
