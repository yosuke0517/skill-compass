import { describe, expect, it, vi } from "vitest";

import {
  getDailyTechPosts,
  type DailyDigestDependencies,
} from "@/lib/x/daily-digest";
import { XApiError } from "@/lib/x/client";
import type { PublicXPost } from "@/lib/x/types";

const now = new Date("2026-07-24T00:15:00.000Z");
const post = (id: number, text = `AI developer tooling update ${id}`): PublicXPost => ({
  id: String(id),
  url: `https://x.com/dev/status/${id}`,
  text,
  author: { id: String(1000 + id), username: `dev${id}`, name: `Dev ${id}` },
  createdAt: "2026-07-23T23:00:00.000Z",
  canonicalLinks: [],
  metrics: { likes: id, reposts: 1, replies: 0, quotes: 0 },
  media: [],
});

function dependencies(
  overrides: Partial<DailyDigestDependencies> = {},
): DailyDigestDependencies {
  const publicPosts = Array.from({ length: 21 }, (_, index) => post(index + 1));
  return {
    now: () => now,
    readBudget: 30,
    getCachedDigest: vi.fn().mockResolvedValue(null),
    saveCachedDigest: vi.fn().mockResolvedValue(undefined),
    createClient: vi.fn().mockResolvedValue({
      getPersonalizedTrends: vi.fn().mockResolvedValue([
        { name: "AI agents", category: "Technology", postCount: 10_000 },
      ]),
      getMe: vi.fn().mockResolvedValue({ id: "999" }),
      searchRecent: vi.fn().mockResolvedValue(publicPosts),
      getFollowingTimeline: vi.fn().mockResolvedValue([]),
    }),
    ...overrides,
  };
}

describe("getDailyTechPosts", () => {
  it("uses personalized technical trends with relevancy search within the read budget", async () => {
    const saveCachedDigest = vi.fn().mockResolvedValue(undefined);
    const deps = dependencies({ saveCachedDigest });

    const result = await getDailyTechPosts(
      "user-1",
      { limit: 5, latestUserMessage: "今日の技術ニュース" },
      deps,
    );

    expect(result.posts).toHaveLength(5);
    expect(result.trendSource).toBe("personalized");
    expect(result.personalizedTrends).toEqual(["AI agents"]);
    expect(result.sourceMix).toEqual({ publicSearch: 5, followingTimeline: 0 });
    expect(result.responseLanguage).toBe("ja");
    const client = await deps.createClient("user-1");
    expect(client.getPersonalizedTrends).toHaveBeenCalledTimes(1);
    expect(client.searchRecent).toHaveBeenCalled();
    expect(client.getFollowingTimeline).not.toHaveBeenCalled();
    expect(
      vi.mocked(client.searchRecent).mock.calls.every(
        ([input]) => input.sortOrder === "relevancy",
      ),
    ).toBe(true);
    expect(
      vi
        .mocked(client.searchRecent)
        .mock.calls.reduce((total, [input]) => total + input.maxResults, 0),
    ).toBeLessThanOrEqual(30);
    expect(
      vi.mocked(client.searchRecent).mock.calls[0][0].maxResults,
    ).toBeLessThanOrEqual(30);
    const persisted = saveCachedDigest.mock.calls[0][2];
    expect(JSON.stringify(persisted)).not.toContain("following_timeline");
    expect(JSON.stringify(persisted)).not.toContain("public_search");
    expect(JSON.stringify(persisted)).not.toContain("candidate");
  });

  it("reuses an unexpired same-day cache", async () => {
    const cached = {
      generatedAt: "2026-07-24T00:00:00.000Z",
      window: {
        start: "2026-07-23T00:00:00.000Z",
        end: "2026-07-24T00:00:00.000Z",
      },
      topics: ["AI"],
      posts: [],
      sourceMix: { publicSearch: 0, followingTimeline: 0 },
      responseLanguage: "ja" as const,
      partialFailures: [],
      trendSource: "personalized" as const,
      personalizedTrends: ["AI agents"],
      digestVersion: 2 as const,
    };
    const deps = dependencies({
      getCachedDigest: vi.fn().mockResolvedValue({
        digest: cached,
        expiresAt: new Date("2026-07-25T00:00:00.000Z"),
      }),
    });

    await expect(
      getDailyTechPosts("user-1", { limit: 5 }, deps),
    ).resolves.toEqual(cached);
    expect(deps.createClient).not.toHaveBeenCalled();
  });

  it("ignores an unexpired cache without the current digest version", async () => {
    const deps = dependencies({
      getCachedDigest: vi.fn().mockResolvedValue({
        digest: {
          generatedAt: "2026-07-24T00:00:00.000Z",
          window: {
            start: "2026-07-23T00:00:00.000Z",
            end: "2026-07-24T00:00:00.000Z",
          },
          topics: ["AI"],
          posts: [],
          sourceMix: { publicSearch: 0, followingTimeline: 0 },
          responseLanguage: "ja",
          partialFailures: [],
          trendSource: "fixed_topics",
          personalizedTrends: [],
        },
        expiresAt: new Date("2026-07-25T00:00:00.000Z"),
      }),
    });

    const result = await getDailyTechPosts("user-1", { limit: 5 }, deps);

    expect(result.trendSource).toBe("personalized");
    expect(deps.createClient).toHaveBeenCalledTimes(1);
  });

  it("falls back to one explicit-OR relevancy search when personalized trends are unavailable", async () => {
    const deps = dependencies({
      createClient: vi.fn().mockResolvedValue({
        getPersonalizedTrends: vi
          .fn()
          .mockRejectedValue(
            new XApiError("x_personalized_trends_unavailable"),
          ),
        getMe: vi.fn().mockResolvedValue({ id: "999" }),
        searchRecent: vi.fn().mockResolvedValue([post(20)]),
        getFollowingTimeline: vi.fn().mockResolvedValue([]),
      }),
    });

    const result = await getDailyTechPosts("user-1", { limit: 5 }, deps);
    expect(result.posts).toHaveLength(1);
    expect(result.trendSource).toBe("fixed_topics");
    expect(result.personalizedTrends).toEqual([]);
    expect(result.partialFailures).toEqual([
      "personalized_trends_unavailable",
    ]);
    const client = await deps.createClient("user-1");
    expect(client.searchRecent).toHaveBeenCalledTimes(1);
    const search = vi.mocked(client.searchRecent).mock.calls[0][0];
    expect(search.query).toContain("AI OR LLM");
    expect(search.query).toContain("OR security OR vulnerability");
    expect(search.sortOrder).toBe("relevancy");
  });

  it("does not request a ten-Post page when the configured read budget is smaller", async () => {
    const deps = dependencies({ readBudget: 5 });

    const result = await getDailyTechPosts("user-1", { limit: 5 }, deps);

    const client = await deps.createClient("user-1");
    expect(client.searchRecent).not.toHaveBeenCalled();
    expect(result.posts).toEqual([]);
  });
});
