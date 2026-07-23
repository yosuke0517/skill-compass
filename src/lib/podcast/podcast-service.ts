import { randomUUID } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";

import {
  podcastAssets,
  podcastChatMessages,
  podcastEpisodes,
} from "@/db/schema";
import type { CurrentUserAccess } from "@/lib/access/types";
import { getEnv } from "@/lib/env";
import {
  askPodcastChat,
  type PodcastChatMessage,
} from "@/lib/podcast/chat";
import { createKeychainApiKeyResolver } from "@/lib/translation/providers/gemini-provider";

type PodcastEpisodeRecord = typeof podcastEpisodes.$inferSelect;

type PodcastEpisodeWithDuration = PodcastEpisodeRecord & {
  durationSeconds: number | null;
};

export type PodcastEpisodeSummary = {
  id: string;
  title: string;
  localDate: string;
  language: "ja" | "en";
  status: string;
  durationSeconds: number | null;
  contextReady: boolean;
};

export type PodcastEpisodeDetail = {
  id: string;
  title: string;
  localDate: string;
  language: "ja" | "en";
  status: string;
  durationSeconds: number | null;
  transcript: Array<{ speaker: string; text: string }>;
  sources: Array<{ title: string; url: string }>;
};

type SavedPodcastMessage = PodcastChatMessage & {
  provider: string | null;
};

export type PodcastServiceDeps = {
  listEpisodes(userId: string, limit: number): Promise<PodcastEpisodeWithDuration[]>;
  findEpisode(userId: string, episodeId: string): Promise<PodcastEpisodeWithDuration | null>;
  getConversation(userId: string, episodeId: string): Promise<PodcastChatMessage[]>;
  generateAnswer(input: {
    episode: PodcastEpisodeRecord;
    conversation: PodcastChatMessage[];
    question: string;
  }): Promise<{ answer: string; provider: string }>;
  saveMessages(userId: string, episodeId: string, messages: SavedPodcastMessage[]): Promise<void>;
};

export async function listPodcastEpisodesForUser(
  user: CurrentUserAccess,
  limit = 20,
  deps: Pick<PodcastServiceDeps, "listEpisodes"> = createPodcastServiceDeps(),
): Promise<PodcastEpisodeSummary[]> {
  assertPodcastAccess(user);
  const boundedLimit = Math.min(20, Math.max(1, limit));
  const episodes = await deps.listEpisodes(user.id, boundedLimit);

  return episodes
    .filter((episode) => episode.userId === user.id)
    .slice(0, boundedLimit)
    .map((episode) => ({
      id: episode.id,
      title: episode.title,
      localDate: toDateKey(episode.localDate),
      language: toLanguage(episode.language),
      status: episode.status,
      durationSeconds: episode.durationSeconds,
      contextReady: Boolean(episode.script || episode.sourceSnapshot.length > 0),
    }));
}

export async function getPodcastEpisodeForUser(
  user: CurrentUserAccess,
  episodeId: string,
  deps: Pick<PodcastServiceDeps, "findEpisode"> = createPodcastServiceDeps(),
): Promise<PodcastEpisodeDetail> {
  assertPodcastAccess(user);
  const episode = await deps.findEpisode(user.id, episodeId);
  if (!episode || episode.userId !== user.id) {
    throw new Error("podcast_episode_not_found");
  }

  return {
    id: episode.id,
    title: episode.title,
    localDate: toDateKey(episode.localDate),
    language: toLanguage(episode.language),
    status: episode.status,
    durationSeconds: episode.durationSeconds,
    transcript:
      episode.script?.speakers.map((line) => ({
        speaker: line.speaker,
        text: line.text,
      })) ?? [],
    sources: episode.sourceSnapshot.map((source) => ({
      title: source.title,
      url: source.url,
    })),
  };
}

export async function askPodcastForUser(
  input: {
    user: CurrentUserAccess;
    episodeId: string;
    question: string;
  },
  deps: Pick<
    PodcastServiceDeps,
    "findEpisode" | "getConversation" | "generateAnswer" | "saveMessages"
  > = createPodcastServiceDeps(),
): Promise<{ answer: string; provider: string }> {
  if (!input.user.entitlements.has("podcast.chat")) {
    throw new Error("podcast_chat_forbidden");
  }

  const episode = await deps.findEpisode(input.user.id, input.episodeId);
  if (!episode || episode.userId !== input.user.id) {
    throw new Error("podcast_episode_not_found");
  }

  const question = input.question.trim();
  if (!question) {
    throw new Error("podcast_question_required");
  }

  const conversation = await deps.getConversation(input.user.id, input.episodeId);
  const result = await deps.generateAnswer({
    episode,
    conversation: conversation.slice(-10),
    question,
  });
  if (!result.answer.trim()) {
    throw new Error("podcast_chat_empty");
  }

  await deps.saveMessages(input.user.id, input.episodeId, [
    { role: "user", text: question, provider: null },
    { role: "assistant", text: result.answer, provider: result.provider },
  ]);
  return result;
}

export function createPodcastServiceDeps(): PodcastServiceDeps {
  return {
    async listEpisodes(userId, limit) {
      const { db } = await import("@/db/client");
      const episodes = await db
        .select()
        .from(podcastEpisodes)
        .where(eq(podcastEpisodes.userId, userId))
        .orderBy(desc(podcastEpisodes.createdAt))
        .limit(limit);
      const assets = await db
        .select({
          episodeId: podcastAssets.episodeId,
          durationSeconds: podcastAssets.durationSeconds,
        })
        .from(podcastAssets)
        .where(eq(podcastAssets.userId, userId));
      const durationByEpisode = new Map(
        assets.map((asset) => [asset.episodeId, asset.durationSeconds]),
      );
      return episodes.map((episode) => ({
        ...episode,
        durationSeconds: durationByEpisode.get(episode.id) ?? null,
      }));
    },
    async findEpisode(userId, episodeId) {
      const { db } = await import("@/db/client");
      const [episode] = await db
        .select()
        .from(podcastEpisodes)
        .where(
          and(
            eq(podcastEpisodes.id, episodeId),
            eq(podcastEpisodes.userId, userId),
          ),
        )
        .limit(1);
      if (!episode) return null;
      const [asset] = await db
        .select({ durationSeconds: podcastAssets.durationSeconds })
        .from(podcastAssets)
        .where(
          and(
            eq(podcastAssets.episodeId, episodeId),
            eq(podcastAssets.userId, userId),
          ),
        )
        .limit(1);
      return { ...episode, durationSeconds: asset?.durationSeconds ?? null };
    },
    async getConversation(userId, episodeId) {
      const { db } = await import("@/db/client");
      const rows = await db
        .select({
          role: podcastChatMessages.role,
          text: podcastChatMessages.text,
        })
        .from(podcastChatMessages)
        .where(
          and(
            eq(podcastChatMessages.episodeId, episodeId),
            eq(podcastChatMessages.userId, userId),
          ),
        )
        .orderBy(asc(podcastChatMessages.createdAt))
        .limit(40);
      return rows.filter(
        (message): message is PodcastChatMessage =>
          message.role === "user" || message.role === "assistant",
      );
    },
    async generateAnswer({ episode, conversation, question }) {
      const env = getEnv();
      const apiKey =
        env.GEMINI_API_KEY_SOURCE === "keychain" && env.GEMINI_KEYCHAIN_SERVICE
          ? await createKeychainApiKeyResolver({
              service: env.GEMINI_KEYCHAIN_SERVICE,
              account: env.GEMINI_KEYCHAIN_ACCOUNT,
            })()
          : env.GEMINI_API_KEY;
      return askPodcastChat({
        apiKey,
        model: env.GEMINI_ASSISTANT_MODEL,
        episodeTitle: episode.title,
        script: episode.script,
        sources: episode.sourceSnapshot,
        conversation,
        question,
      });
    },
    async saveMessages(userId, episodeId, messages) {
      const { db } = await import("@/db/client");
      await db.insert(podcastChatMessages).values(
        messages.map((message) => ({
          id: `podcast_chat_${randomUUID()}`,
          episodeId,
          userId,
          role: message.role,
          text: message.text,
          provider: message.provider,
        })),
      );
    },
  };
}

function assertPodcastAccess(user: CurrentUserAccess) {
  if (
    !user.entitlements.has("podcast.chat") &&
    !user.entitlements.has("podcast.generate") &&
    !user.entitlements.has("podcast.sample.view")
  ) {
    throw new Error("podcast_forbidden");
  }
}

function toLanguage(language: string): "ja" | "en" {
  return language === "ja" ? "ja" : "en";
}

function toDateKey(value: string | Date): string {
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}
