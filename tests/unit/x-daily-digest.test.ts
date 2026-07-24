import { describe, expect, it, vi } from "vitest";

import {
  getDailyTechPosts,
  type DailyDigestDependencies,
} from "@/lib/x/daily-digest";
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
  const timelinePosts = Array.from({ length: 9 }, (_, index) =>
    post(index + 22, `Cloud security patch details ${index}`),
  );
  return {
    now: () => now,
    readBudget: 30,
    getCachedDigest: vi.fn().mockResolvedValue(null),
    saveCachedDigest: vi.fn().mockResolvedValue(undefined),
    createClient: vi.fn().mockResolvedValue({
      getMe: vi.fn().mockResolvedValue({ id: "999" }),
      searchRecent: vi.fn().mockResolvedValue(publicPosts),
      getFollowingTimeline: vi.fn().mockResolvedValue(timelinePosts),
    }),
    ...overrides,
  };
}

describe("getDailyTechPosts", () => {
  it("collects both sources, caps unique candidates, and persists only output", async () => {
    const saveCachedDigest = vi.fn().mockResolvedValue(undefined);
    const deps = dependencies({ saveCachedDigest });

    const result = await getDailyTechPosts(
      "user-1",
      { limit: 5, latestUserMessage: "今日の技術ニュース" },
      deps,
    );

    expect(result.posts).toHaveLength(5);
    expect(result.sourceMix.publicSearch + result.sourceMix.followingTimeline).toBe(5);
    expect(result.responseLanguage).toBe("ja");
    const client = await deps.createClient("user-1");
    expect(client.searchRecent).toHaveBeenCalledTimes(1);
    expect(client.getFollowingTimeline).toHaveBeenCalledTimes(1);
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

  it("returns a partial digest when the personal timeline fails", async () => {
    const deps = dependencies({
      createClient: vi.fn().mockResolvedValue({
        getMe: vi.fn().mockResolvedValue({ id: "999" }),
        searchRecent: vi.fn().mockResolvedValue([post(1)]),
        getFollowingTimeline: vi.fn().mockRejectedValue(new Error("no timeline")),
      }),
    });

    const result = await getDailyTechPosts("user-1", { limit: 5 }, deps);
    expect(result.posts).toHaveLength(1);
    expect(result.partialFailures).toEqual(["following_timeline_unavailable"]);
  });
});
