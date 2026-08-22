import { describe, expect, it } from "vitest";

import {
  buildTrendSearchQuery,
  xDailyUpdateQueries,
  selectTechnicalTrends,
  xFixedTopicFallbackQuery,
} from "@/lib/x/trend-queries";

describe("X trend queries", () => {
  it("selects bounded technical personalized trends", () => {
    expect(
      selectTechnicalTrends(
        [
          { name: "AI agents", category: "Technology" },
          { name: "PostgreSQL 19", category: "Software" },
          { name: "Celebrity awards", category: "Entertainment" },
          { name: "Kubernetes security", category: "Technology" },
        ],
        2,
      ),
    ).toEqual(["AI agents", "PostgreSQL 19"]);
  });

  it.each(['AI") OR from:attacker', "security\n-is:retweet", "a".repeat(81)])(
    "rejects unsafe or unbounded trend text: %s",
    (trend) => {
      expect(() => buildTrendSearchQuery(trend)).toThrow("unsafe_x_trend");
    },
  );

  it("builds a quoted relevancy query that excludes reposts and replies", () => {
    expect(buildTrendSearchQuery("AI agents")).toBe('"AI agents" -is:retweet -is:reply');
  });

  it("joins fixed technical topics with explicit OR in one bounded fallback", () => {
    expect(xFixedTopicFallbackQuery).toContain("AI OR LLM");
    expect(xFixedTopicFallbackQuery).toContain("OR frontend OR backend");
    expect(xFixedTopicFallbackQuery).toContain("OR cloud OR Kubernetes");
    expect(xFixedTopicFallbackQuery).toContain("OR security OR vulnerability");
    expect(xFixedTopicFallbackQuery).toContain("-is:retweet -is:reply");
  });

  it("uses dedicated AI, developer-platform, and security update searches", () => {
    expect(xDailyUpdateQueries).toHaveLength(3);
    expect(xDailyUpdateQueries[0]).toContain("Claude");
    expect(xDailyUpdateQueries[0]).toContain("ChatGPT");
    expect(xDailyUpdateQueries[0]).toContain("Gemini");
    expect(xDailyUpdateQueries[0]).toContain("Grok");
    expect(xDailyUpdateQueries[1]).toContain("GitHub");
    expect(xDailyUpdateQueries[1]).toContain("Next.js");
    expect(xDailyUpdateQueries[1]).toContain("Cloudflare");
    expect(xDailyUpdateQueries[2]).toContain("CVE");
    expect(xDailyUpdateQueries[2]).toContain("preinstall");
    expect(xDailyUpdateQueries[2]).toContain("Claude");
    expect(xDailyUpdateQueries[2]).toContain("OpenAI");
    expect(xDailyUpdateQueries[2]).toContain("Gemini");
    expect(xDailyUpdateQueries[2]).toContain("Grok");
    expect(xDailyUpdateQueries.every((query) => query.includes("-is:retweet"))).toBe(true);
    expect(xDailyUpdateQueries.every((query) => query.length <= 512)).toBe(true);
  });
});
