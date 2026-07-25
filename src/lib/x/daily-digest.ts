import { getEnv } from "@/lib/env";
import { detectResponseLanguage } from "@/lib/language/detect-response-language";
import {
  createXApiClient,
  XApiError,
  type XApiClient,
} from "@/lib/x/client";
import {
  getCachedDailyDigest,
  saveCachedDailyDigest,
} from "@/lib/x/daily-cache";
import {
  rankTechPosts,
  type TechPostCandidate,
} from "@/lib/x/ranking";
import { getValidXAccessToken } from "@/lib/x/token-provider";
import { xTechTopics } from "@/lib/x/topics";
import {
  buildTrendSearchQuery,
  selectTechnicalTrends,
  xFixedTopicFallbackQuery,
} from "@/lib/x/trend-queries";
import type { RankedTechPost } from "@/lib/x/types";

export type DailyTechDigest = {
  digestVersion: 2;
  generatedAt: string;
  window: { start: string; end: string };
  topics: string[];
  posts: RankedTechPost[];
  sourceMix: { publicSearch: number; followingTimeline: number };
  trendSource: "personalized" | "fixed_topics";
  personalizedTrends: string[];
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
      | "getPersonalizedTrends"
      | "getMe"
      | "searchRecent"
      | "getFollowingTimeline"
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
  if (
    cached &&
    cached.expiresAt.getTime() > now.getTime() &&
    cached.digest.digestVersion === 2
  ) {
    return cached.digest;
  }

  const budget = Math.min(30, Math.max(1, dependencies.readBudget));
  const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const client = await dependencies.createClient(userId);
  const candidates: TechPostCandidate[] = [];
  const partialFailures: string[] = [];
  let personalizedTrends: string[] = [];

  try {
    personalizedTrends = selectTechnicalTrends(
      await client.getPersonalizedTrends(),
      Math.max(0, Math.min(2, Math.floor(budget / 10) - 1)),
    );
  } catch (error) {
    if (
      error instanceof XApiError &&
      error.code === "x_reconnect_required"
    ) {
      throw error;
    }
    partialFailures.push("personalized_trends_unavailable");
  }

  const queries = [
    ...personalizedTrends.map(buildTrendSearchQuery),
    xFixedTopicFallbackQuery,
  ];
  let remainingBudget = budget;
  for (
    let index = 0;
    index < queries.length && remainingBudget >= 10;
    index += 1
  ) {
    const remainingQueries = queries.length - index;
    const queryBudget = Math.max(
      10,
      Math.floor(remainingBudget / remainingQueries),
    );
    try {
      const posts = await client.searchRecent({
        query: queries[index],
        startTime: start,
        maxResults: queryBudget,
        sortOrder: "relevancy",
      });
      candidates.push(
        ...posts.slice(0, queryBudget).map((post) => ({
          post,
          source: "public_search" as const,
        })),
      );
      remainingBudget -= queryBudget;
    } catch {
      partialFailures.push("public_search_unavailable");
      remainingBudget -= queryBudget;
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
    digestVersion: 2,
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
    trendSource:
      personalizedTrends.length > 0 ? "personalized" : "fixed_topics",
    personalizedTrends,
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
