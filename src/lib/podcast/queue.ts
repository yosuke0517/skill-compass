export type PodcastJob = {
  id: string;
  episodeId: string;
  userId: string;
  kind: "generate";
  status: "queued" | "running" | "succeeded" | "failed";
  idempotencyKey: string;
  nextRunAt: Date;
};

export type EnqueuePodcastJobInput = {
  episodeId: string;
  userId: string;
  idempotencyKey: string;
  now?: Date;
};

export interface PodcastJobQueue {
  enqueue(input: EnqueuePodcastJobInput): Promise<PodcastJob>;
}
