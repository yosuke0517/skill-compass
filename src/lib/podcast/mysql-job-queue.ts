import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

import type { PodcastJobQueue, EnqueuePodcastJobInput, PodcastJob } from "@/lib/podcast/queue";

export function createMySqlPodcastJobQueue(): PodcastJobQueue {
  return {
    async enqueue(input: EnqueuePodcastJobInput): Promise<PodcastJob> {
      const { db } = await import("@/db/client");
      const { podcastJobs } = await import("@/db/schema");
      const now = input.now ?? new Date();
      const id = `podcast_job_${randomUUID()}`;
      const row = {
        id,
        episodeId: input.episodeId,
        userId: input.userId,
        kind: "generate",
        status: "queued",
        attempts: 0,
        idempotencyKey: input.idempotencyKey,
        nextRunAt: now,
      } as const;
      await db.insert(podcastJobs).values(row).onDuplicateKeyUpdate({ set: { updatedAt: now } });
      const [stored] = await db.select().from(podcastJobs).where(eq(podcastJobs.idempotencyKey, input.idempotencyKey)).limit(1);
      return {
        id: stored?.id ?? id,
        episodeId: stored?.episodeId ?? input.episodeId,
        userId: stored?.userId ?? input.userId,
        kind: "generate",
        status: (stored?.status as PodcastJob["status"] | undefined) ?? "queued",
        idempotencyKey: stored?.idempotencyKey ?? input.idempotencyKey,
        nextRunAt: stored?.nextRunAt ?? now,
      };
    },
  };
}
