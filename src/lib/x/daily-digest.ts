import { getEnv } from "@/lib/env";
import { detectResponseLanguage } from "@/lib/language/detect-response-language";
import { createXApiClient, type XApiClient } from "@/lib/x/client";
import {
  getCachedDailyDigest,
  saveCachedDailyDigest,
} from "@/lib/x/daily-cache";
import {
  rankTechPosts,
  type TechPostCandidate,
} from "@/lib/x/ranking";
import { getValidXAccessToken } from "@/lib/x/token-provider";
import { xRecentSearchQuery, xTechTopics } from "@/lib/x/topics";
import type { RankedTechPost } from "@/lib/x/types";

export type DailyTechDigest = {
  generatedAt: string;
  window: { start: string; end: string };
  topics: string[];
  posts: RankedTechPost[];
  sourceMix: { publicSearch: number; followingTimeline: number };
  responseLanguage: "ja" | "en";
  partialFailures: string[];
};

export type DailyDigestDependencies = {
  now: () => Date;
  readBudget: number;
  getCachedDigest: (
    userId: string,
    localDate: string,
  ) => Promise<{ digest: DailyTechDigest; expiresAt: Date } | null>;
  saveCachedDigest: (
    userId: string,
    localDate: string,
    digest: DailyTechDigest,
    expiresAt: Date,
  ) => Promise<void>;
  createClient: (userId: string) => Promise<
    Pick<
      XApiClient,
      "getMe" | "searchRecent" | "getFollowingTimeline"
    >
  >;
};

function tokyoDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function defaultDependencies(): DailyDigestDependencies {
  const env = getEnv();
  return {
    now: () => new Date(),
    readBudget: env.X_DAILY_POST_READ_BUDGET,
    getCachedDigest: getCachedDailyDigest,
    saveCachedDigest: saveCachedDailyDigest,
    createClient: async (userId) =>
      createXApiClient(await getValidXAccessToken(userId)),
  };
}

export async function getDailyTechPosts(
  userId: string,
  input: { limit?: number; latestUserMessage?: string },
  dependencies: DailyDigestDependencies = defaultDependencies(),
): Promise<DailyTechDigest> {
  const now = dependencies.now();
  const localDate = tokyoDateKey(now);
  const cached = await dependencies.getCachedDigest(userId, localDate);
  if (cached && cached.expiresAt.getTime() > now.getTime()) {
    return cached.digest;
  }

  const budget = Math.min(30, Math.max(1, dependencies.readBudget));
  const publicBudget = Math.ceil(budget * 0.7);
  const timelineBudget = budget - publicBudget;
  const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const client = await dependencies.createClient(userId);
  const candidates: TechPostCandidate[] = [];
  const partialFailures: string[] = [];

  try {
    const posts = await client.searchRecent({
      query: xRecentSearchQuery,
      startTime: start,
      maxResults: publicBudget,
    });
    candidates.push(
      ...posts.slice(0, publicBudget).map((post) => ({
        post,
        source: "public_search" as const,
      })),
    );
  } catch {
    partialFailures.push("public_search_unavailable");
  }

  if (timelineBudget > 0) {
    try {
      const me = await client.getMe();
      const posts = await client.getFollowingTimeline({
        userId: me.id,
        startTime: start,
        maxResults: timelineBudget,
      });
      candidates.push(
        ...posts.slice(0, timelineBudget).map((post) => ({
          post,
          source: "following_timeline" as const,
        })),
      );
    } catch {
      partialFailures.push("following_timeline_unavailable");
    }
  }

  const uniqueCandidates = [
    ...new Map(candidates.map((item) => [item.post.id, item])).values(),
  ].slice(0, budget);
  const ranked = rankTechPosts({
    candidates: uniqueCandidates,
    limit: Math.min(10, Math.max(1, input.limit ?? 5)),
    now,
  });
  const digest: DailyTechDigest = {
    generatedAt: now.toISOString(),
    window: { start: start.toISOString(), end: now.toISOString() },
    topics: [...xTechTopics],
    posts: ranked.map((item) => item.post),
    sourceMix: {
      publicSearch: ranked.filter((item) => item.source === "public_search")
        .length,
      followingTimeline: ranked.filter(
        (item) => item.source === "following_timeline",
      ).length,
    },
    responseLanguage: detectResponseLanguage(input.latestUserMessage ?? ""),
    partialFailures,
  };
  await dependencies.saveCachedDigest(
    userId,
    localDate,
    digest,
    new Date(now.getTime() + 86_400_000),
  );
  return digest;
}
