import { describe, expect, it, vi } from "vitest";

import { createXApiClient, XApiError } from "@/lib/x/client";

const apiResponse = {
  data: [
    {
      id: "123",
      text: "short text",
      note_tweet: { text: "full long-form text" },
      author_id: "u1",
      created_at: "2026-07-24T00:00:00.000Z",
      lang: "en",
      conversation_id: "120",
      public_metrics: {
        like_count: 8,
        retweet_count: 3,
        reply_count: 2,
        quote_count: 1,
      },
      referenced_tweets: [
        { type: "quoted", id: "100" },
        { type: "replied_to", id: "120" },
      ],
      attachments: { media_keys: ["m1"] },
      entities: {
        urls: [{ expanded_url: "https://example.com/advisory" }],
      },
    },
  ],
  includes: {
    users: [{ id: "u1", username: "alice", name: "Alice" }],
    media: [
      {
        media_key: "m1",
        type: "photo",
        url: "https://pbs.twimg.com/media/example.jpg",
        alt_text: "A diagram",
      },
    ],
  },
};

describe("createXApiClient", () => {
  it("uses fixed X API lookup endpoints and normalizes allowlisted fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(apiResponse), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = createXApiClient("secret-bearer", fetchMock);

    await expect(client.getPost("123")).resolves.toMatchObject({
      id: "123",
      url: "https://x.com/alice/status/123",
      text: "full long-form text",
      author: { id: "u1", username: "alice", name: "Alice" },
      quotedPostId: "100",
      parentPostId: "120",
      canonicalLinks: ["https://example.com/advisory"],
      metrics: { likes: 8, reposts: 3, replies: 2, quotes: 1 },
      media: [
        {
          type: "photo",
          url: "https://pbs.twimg.com/media/example.jpg",
          altText: "A diagram",
        },
      ],
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/^https:\/\/api\.x\.com\/2\/tweets\/123\?/);
    expect(String(url)).toContain("tweet.fields=");
    expect(init.headers.authorization).toBe("Bearer secret-bearer");
  });

  it("batches numeric post IDs only", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(apiResponse), { status: 200 }),
    );
    const client = createXApiClient("token", fetchMock);

    await client.getPosts(["123", "456"]);
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "https://api.x.com/2/tweets?ids=123%2C456",
    );
    await expect(client.getPosts(["123", "bad"])).rejects.toThrow(
      "x_post_unavailable",
    );
  });

  it("retrieves normalized personalized trends from the fixed X API endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              trend_name: "AI agents",
              category: "Technology",
              post_count: 4200,
              trending_since: "2026-07-24T00:00:00.000Z",
              ignored: "provider-only-field",
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const client = createXApiClient("token", fetchMock);

    await expect(client.getPersonalizedTrends()).resolves.toEqual([
      {
        name: "AI agents",
        category: "Technology",
        postCount: 4200,
        trendingSince: "2026-07-24T00:00:00.000Z",
      },
    ]);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://api.x.com/2/users/personalized_trends?personalized_trend.fields=category%2Cpost_count%2Ctrend_name%2Ctrending_since",
    );
  });

  it("requests recent search results in relevancy order when selected", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(apiResponse), { status: 200 }),
    );
    const client = createXApiClient("token", fetchMock);

    await client.searchRecent({
      query: "AI -is:retweet",
      startTime: new Date("2026-07-23T00:00:00.000Z"),
      maxResults: 10,
      sortOrder: "relevancy",
    });

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get("sort_order")).toBe("relevancy");
  });

  it("classifies a Personalized Trends 401 as endpoint unavailability", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"detail":"not entitled"}', { status: 401 }),
    );
    const client = createXApiClient("valid-user-token", fetchMock);

    await expect(client.getPersonalizedTrends()).rejects.toMatchObject({
      code: "x_personalized_trends_unavailable",
    });
  });

  it.each([
    [401, "x_reconnect_required"],
    [404, "x_post_unavailable"],
    [429, "x_rate_limited"],
  ])("maps HTTP %s to %s without leaking provider data", async (status, code) => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"detail":"provider-secret"}', { status }),
    );
    const client = createXApiClient("secret-bearer", fetchMock);

    let caught: unknown;
    try {
      await client.getPost("123");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(XApiError);
    expect((caught as XApiError).code).toBe(code);
    expect(String(caught)).not.toContain("provider-secret");
    expect(String(caught)).not.toContain("secret-bearer");
  });

  it("maps X billing failures to a safe error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"title":"CreditsDepleted"}', { status: 402 }),
    );
    const client = createXApiClient("token", fetchMock);

    await expect(client.getPost("123")).rejects.toMatchObject({
      code: "x_api_billing_unavailable",
    });
  });
});
