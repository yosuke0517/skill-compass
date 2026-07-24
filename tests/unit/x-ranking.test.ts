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
  it("targets a 70/30 public-search and following mix", () => {
    const candidates = [
      candidate("1", "New LLM agent evaluation tooling"),
      candidate("2", "PostgreSQL query planner deep dive"),
      candidate("3", "Cloud observability tracing release"),
      candidate("4", "Web authentication passkey update"),
      candidate("5", "Backend distributed systems design"),
      candidate("6", "React compiler engineering details", "following_timeline"),
      candidate("7", "Kubernetes security policy guide", "following_timeline"),
    ];

    const result = rankTechPosts({ candidates, limit: 5, now });
    expect(result).toHaveLength(5);
    expect(
      result.filter((item) => item.source === "public_search"),
    ).toHaveLength(4);
    expect(
      result.filter((item) => item.source === "following_timeline"),
    ).toHaveLength(1);
  });

  it("boosts concrete security advisories even with low engagement", () => {
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
      limit: 1,
      now,
    });
    expect(result[0].post.id).toBe("10");
    expect(result[0].post.reasons).toContain("concrete_security_update");
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
});
