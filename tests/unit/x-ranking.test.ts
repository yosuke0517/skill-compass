import { describe, expect, it } from "vitest";

import { rankTechPosts, type TechPostCandidate } from "@/lib/x/ranking";
import type { PublicXPost } from "@/lib/x/types";

const now = new Date("2026-07-24T00:00:00.000Z");
function candidate(
  id: string,
  text: string,
  source: TechPostCandidate["source"] = "public_search",
  metrics = { likes: 10, reposts: 2, replies: 1, quotes: 0 },
): TechPostCandidate {
  const post: PublicXPost = {
    id,
    url: `https://x.com/dev/status/${id}`,
    text,
    author: { id: `u${id}`, username: `dev${id}`, name: `Dev ${id}` },
    createdAt: "2026-07-23T22:00:00.000Z",
    canonicalLinks: [],
    metrics,
    media: [],
  };
  return { post, source };
}

describe("rankTechPosts", () => {
  it("ranks all sources by quality without reserving a following quota", () => {
    const candidates = [
      candidate("1", "New LLM agent evaluation tooling", "public_search", {
        likes: 500,
        reposts: 80,
        replies: 20,
        quotes: 10,
      }),
      candidate("2", "PostgreSQL query planner deep dive", "public_search", {
        likes: 400,
        reposts: 60,
        replies: 10,
        quotes: 5,
      }),
      candidate("3", "Cloud observability tracing release", "public_search", {
        likes: 300,
        reposts: 50,
        replies: 8,
        quotes: 4,
      }),
      candidate("4", "Web authentication passkey update", "public_search", {
        likes: 200,
        reposts: 30,
        replies: 6,
        quotes: 3,
      }),
      candidate("5", "Backend distributed systems design", "public_search", {
        likes: 100,
        reposts: 20,
        replies: 5,
        quotes: 2,
      }),
      candidate("6", "React compiler engineering details", "following_timeline", {
        likes: 2,
        reposts: 0,
        replies: 0,
        quotes: 0,
      }),
    ];

    const result = rankTechPosts({ candidates, limit: 5, now });
    expect(result).toHaveLength(5);
    expect(result.every((item) => item.source === "public_search")).toBe(true);
  });

  it("labels concrete security advisories without overriding strong popularity", () => {
    const result = rankTechPosts({
      candidates: [
        candidate(
          "10",
          "CVE-2026-1234 authentication bypass: vendor patch available",
          "public_search",
          { likes: 0, reposts: 0, replies: 0, quotes: 0 },
        ),
        candidate(
          "11",
          "Popular AI developer tooling discussion",
          "public_search",
          { likes: 10_000, reposts: 2_000, replies: 500, quotes: 300 },
        ),
      ],
      limit: 2,
      now,
    });
    expect(result.map((item) => item.post.id)).toEqual(["11", "10"]);
    expect(result[1].post.reasons).toContain("concrete_security_update");
  });

  it("filters low-value content and deduplicates text and canonical links", () => {
    const first = candidate("20", "PostgreSQL 19 performance benchmark details");
    first.post.canonicalLinks = ["https://example.com/release"];
    const duplicateLink = candidate("21", "Database release announcement");
    duplicateLink.post.canonicalLinks = ["https://example.com/release"];
    const result = rankTechPosts({
      candidates: [
        first,
        duplicateLink,
        candidate("22", "PostgreSQL 19 performance benchmark details"),
        candidate("23", "We're hiring senior engineers apply now"),
        candidate("24", "Like and repost if you agree!"),
        candidate("25", "Bitcoin price will moon today"),
        candidate("26", ""),
      ],
      limit: 10,
      now,
    });

    expect(result.map((item) => item.post.id)).toEqual(["20"]);
  });

  it("excludes weak engagement that only reaches the old weighted threshold", () => {
    const result = rankTechPosts({
      candidates: [
        candidate(
          "30",
          "AI developer tooling update",
          "public_search",
          { likes: 4, reposts: 2, replies: 2, quotes: 0 },
        ),
      ],
      limit: 5,
      now,
    });

    expect(result).toEqual([]);
  });
});
