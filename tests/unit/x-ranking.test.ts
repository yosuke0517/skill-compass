import { describe, expect, it } from "vitest";

import { rankTechPosts, type TechPostCandidate } from "@/lib/x/ranking";
import type { PublicXPost } from "@/lib/x/types";

const now = new Date("2026-07-24T00:00:00.000Z");
function candidate(
  id: string,
  text: string,
  source: TechPostCandidate["source"] = "public_search",
  metrics = { likes: 10, reposts: 2, replies: 1, quotes: 0 },
  username = `dev${id}`,
): TechPostCandidate {
  const post: PublicXPost = {
    id,
    url: `https://x.com/dev/status/${id}`,
    text,
    author: { id: `u${id}`, username, name: `Dev ${id}` },
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
      candidate("1", "New feature released for LLM agent evaluation tooling", "public_search", {
        likes: 500,
        reposts: 80,
        replies: 20,
        quotes: 10,
      }),
      candidate("2", "PostgreSQL 19 query planner released", "public_search", {
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
      candidate("4", "Web authentication passkey update released", "public_search", {
        likes: 200,
        reposts: 30,
        replies: 6,
        quotes: 3,
      }),
      candidate("5", "Backend platform launches distributed tracing", "public_search", {
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

  it("prioritizes a concrete security advisory over generic popularity", () => {
    const result = rankTechPosts({
      candidates: [
        candidate(
          "10",
          "CVE-2026-1234 authentication bypass: vendor patch available",
          "public_search",
          { likes: 0, reposts: 0, replies: 0, quotes: 0 },
        ),
        candidate("11", "Popular AI developer tooling discussion", "public_search", {
          likes: 10_000,
          reposts: 2_000,
          replies: 500,
          quotes: 300,
        }),
      ],
      limit: 2,
      now,
    });
    expect(result.map((item) => item.post.id)).toEqual(["10"]);
    expect(result[0].post.reasons).toContain("security_incident");
  });

  it("filters low-value content and deduplicates text and canonical links", () => {
    const first = candidate("20", "PostgreSQL 19 performance update released");
    first.post.canonicalLinks = ["https://example.com/release"];
    const duplicateLink = candidate("21", "Database release announcement");
    duplicateLink.post.canonicalLinks = ["https://example.com/release"];
    const result = rankTechPosts({
      candidates: [
        first,
        duplicateLink,
        candidate("22", "PostgreSQL 19 performance update released"),
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
        candidate("30", "AI developer tooling update", "public_search", {
          likes: 4,
          reposts: 2,
          replies: 2,
          quotes: 0,
        }),
      ],
      limit: 5,
      now,
    });

    expect(result).toEqual([]);
  });

  it("ranks an official product release above a viral generic explanation", () => {
    const result = rankTechPosts({
      candidates: [
        candidate(
          "40",
          "What is AI Agent Architecture? A complete beginner guide",
          "public_search",
          { likes: 5_000, reposts: 800, replies: 300, quotes: 100 },
        ),
        candidate(
          "41",
          "Claude Code now supports agent hooks. The new feature is available today.",
          "public_search",
          { likes: 20, reposts: 4, replies: 2, quotes: 1 },
          "AnthropicAI",
        ),
      ],
      limit: 5,
      now,
    });

    expect(result.map((item) => item.post.id)).toEqual(["41"]);
    expect(result[0].post.reasons).toEqual(
      expect.arrayContaining(["new_feature", "official_announcement", "primary_source"]),
    );
  });

  it("excludes crypto promotion and get-rich-quick funnels", () => {
    const result = rankTechPosts({
      candidates: [
        candidate(
          "50",
          "Beldex AI agent token launches today. Join the presale and buy now.",
          "public_search",
          { likes: 800, reposts: 200, replies: 50, quotes: 30 },
        ),
        candidate(
          "51",
          "I made 1 million yen a month with ChatGPT. Follow and DM me for the method.",
          "public_search",
          { likes: 3_000, reposts: 400, replies: 100, quotes: 50 },
        ),
      ],
      limit: 5,
      now,
    });

    expect(result).toEqual([]);
  });

  it("keeps concrete security action even with low engagement", () => {
    const result = rankTechPosts({
      candidates: [
        candidate(
          "60",
          "Next.js security advisory CVE-2026-4321: authentication bypass fixed in 16.2.11. Upgrade now.",
          "public_search",
          { likes: 1, reposts: 0, replies: 0, quotes: 0 },
          "nextjs",
        ),
      ],
      limit: 5,
      now,
    });

    expect(result).toHaveLength(1);
    expect(result[0].post.reasons).toEqual(
      expect.arrayContaining(["security_incident", "official_announcement"]),
    );
  });

  it("deduplicates different posts about the same product announcement", () => {
    const official = candidate(
      "70",
      "OpenAI API launches Responses API v2 today with background mode.",
      "public_search",
      { likes: 100, reposts: 20, replies: 5, quotes: 4 },
      "OpenAIDevs",
    );
    official.post.canonicalLinks = ["https://openai.com/responses-v2"];
    const commentary = candidate(
      "71",
      "Breaking: the new OpenAI Responses API v2 adds background mode.",
      "public_search",
      { likes: 1_000, reposts: 200, replies: 50, quotes: 20 },
    );
    commentary.post.canonicalLinks = ["https://openai.com/responses-v2"];
    const result = rankTechPosts({
      candidates: [commentary, official],
      limit: 5,
      now,
    });

    expect(result).toHaveLength(1);
    expect(result[0].post.id).toBe("70");
  });

  it("uses views to order otherwise comparable updates", () => {
    const lowerReach = candidate(
      "80",
      "Cloudflare launches Workflows observability dashboard.",
      "public_search",
    );
    lowerReach.post.metrics.views = 1_000;
    const higherReach = candidate(
      "81",
      "GitHub launches Copilot migration assistant.",
      "public_search",
    );
    higherReach.post.metrics.views = 500_000;

    const result = rankTechPosts({
      candidates: [lowerReach, higherReach],
      limit: 5,
      now,
    });

    expect(result.map((item) => item.post.id)).toEqual(["81", "80"]);
  });

  it("limits one product to two distinct announcements", () => {
    const result = rankTechPosts({
      candidates: [
        candidate("90", "OpenAI launches the Orion model.", "public_search"),
        candidate("91", "ChatGPT adds calendar connectors.", "public_search"),
        candidate("92", "Codex introduces branch analytics.", "public_search"),
        candidate("93", "Next.js releases version 16.3.0.", "public_search"),
      ],
      limit: 5,
      now,
    });

    expect(result).toHaveLength(3);
    expect(result.filter((item) => /OpenAI|ChatGPT|Codex/.test(item.post.text))).toHaveLength(2);
    expect(result.some((item) => item.post.id === "93")).toBe(true);
  });

  it("keeps an official API update even when its announcement says deep dive", () => {
    const result = rankTechPosts({
      candidates: [
        candidate(
          "100",
          "Deep dive: OpenAI releases the Responses API v3 with resumable streams.",
          "public_search",
          { likes: 1, reposts: 0, replies: 0, quotes: 0 },
          "OpenAIDevs",
        ),
      ],
      limit: 5,
      now,
    });

    expect(result.map((item) => item.post.id)).toEqual(["100"]);
  });

  it("does not suppress distinct critical advisories with the product diversity cap", () => {
    const result = rankTechPosts({
      candidates: [
        candidate("110", "Next.js security advisory CVE-2026-1100 fixed in 16.3.1."),
        candidate("111", "Next.js security advisory CVE-2026-1101 fixed in 16.3.2."),
        candidate("112", "Next.js security advisory CVE-2026-1102 fixed in 16.3.3."),
      ],
      limit: 5,
      now,
    });

    expect(result).toHaveLength(3);
  });

  it("keeps a rate-limit increase instead of treating raised as fundraising", () => {
    const result = rankTechPosts({
      candidates: [
        candidate(
          "120",
          "OpenAI API rate limits raised for tier 3 accounts.",
          "public_search",
          { likes: 20, reposts: 2, replies: 1, quotes: 0 },
          "OpenAIDevs",
        ),
      ],
      limit: 5,
      now,
    });

    expect(result.map((item) => item.post.id)).toEqual(["120"]);
    expect(result[0].post.reasons).toContain("pricing_or_limit_change");
  });

  it("does not classify an ordinary bug fix as a security incident", () => {
    const result = rankTechPosts({
      candidates: [
        candidate(
          "121",
          "Claude Code crash fixed in v2.1.0 release.",
          "public_search",
          { likes: 20, reposts: 2, replies: 1, quotes: 0 },
          "AnthropicAI",
        ),
      ],
      limit: 5,
      now,
    });

    expect(result).toHaveLength(1);
    expect(result[0].post.reasons).not.toContain("security_incident");
  });
});
