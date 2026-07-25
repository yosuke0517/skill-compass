import type {
  PersonalizedTrend,
  PublicXPost,
  XMedia,
  XServiceErrorCode,
} from "@/lib/x/types";

type XUser = { id?: string; username?: string; name?: string };
type XMediaResponse = {
  media_key?: string;
  type?: string;
  url?: string;
  preview_image_url?: string;
  alt_text?: string;
};
type XTweet = {
  id?: string;
  text?: string;
  note_tweet?: { text?: string };
  author_id?: string;
  created_at?: string;
  lang?: string;
  conversation_id?: string;
  referenced_tweets?: Array<{ type?: string; id?: string }>;
  attachments?: { media_keys?: string[] };
  entities?: { urls?: Array<{ expanded_url?: string }> };
  public_metrics?: {
    like_count?: number;
    retweet_count?: number;
    reply_count?: number;
    quote_count?: number;
  };
};
type XPersonalizedTrend = {
  trend_name?: string;
  category?: string;
  post_count?: number;
  trending_since?: string;
};
type XApiEnvelope = {
  data?: unknown;
  includes?: { users?: XUser[]; media?: XMediaResponse[] };
};

export type XApiClient = {
  getPost(id: string): Promise<PublicXPost>;
  getPosts(ids: string[]): Promise<PublicXPost[]>;
  searchRecent(input: {
    query: string;
    startTime: Date;
    maxResults: number;
    sortOrder?: "recency" | "relevancy";
  }): Promise<PublicXPost[]>;
  getPersonalizedTrends(): Promise<PersonalizedTrend[]>;
  getMe(): Promise<{ id: string }>;
  getFollowingTimeline(input: {
    userId: string;
    startTime: Date;
    maxResults: number;
  }): Promise<PublicXPost[]>;
};

export class XApiError extends Error {
  constructor(
    readonly code: XServiceErrorCode,
    readonly retryAfterSeconds?: number,
  ) {
    super(code);
    this.name = "XApiError";
  }
}

const tweetFields = [
  "id",
  "text",
  "author_id",
  "created_at",
  "lang",
  "conversation_id",
  "public_metrics",
  "referenced_tweets",
  "attachments",
  "entities",
  "note_tweet",
].join(",");
const expansions = ["author_id", "attachments.media_keys"].join(",");
const userFields = ["id", "name", "username"].join(",");
const mediaFields = [
  "media_key",
  "type",
  "url",
  "preview_image_url",
  "alt_text",
].join(",");

function assertPostId(id: string) {
  if (!/^\d+$/.test(id)) throw new XApiError("x_post_unavailable");
}

function addPostFields(params: URLSearchParams) {
  params.set("tweet.fields", tweetFields);
  params.set("expansions", expansions);
  params.set("user.fields", userFields);
  params.set("media.fields", mediaFields);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTweet(value: unknown): value is XTweet {
  return (
    isRecord(value) &&
    ("text" in value || "author_id" in value || "created_at" in value)
  );
}

function isPersonalizedTrend(value: unknown): value is XPersonalizedTrend {
  return isRecord(value) && typeof value.trend_name === "string";
}

function normalizePosts(envelope: XApiEnvelope): PublicXPost[] {
  const rows: XTweet[] = Array.isArray(envelope.data)
    ? envelope.data.filter(isTweet)
    : isTweet(envelope.data)
      ? [envelope.data]
      : [];
  const users = new Map(
    (envelope.includes?.users ?? [])
      .filter((user) => user.id)
      .map((user) => [user.id!, user]),
  );
  const media = new Map(
    (envelope.includes?.media ?? [])
      .filter((item) => item.media_key)
      .map((item) => [item.media_key!, item]),
  );

  return rows.flatMap((row): PublicXPost[] => {
    if (!row.id || !row.author_id || !row.created_at) return [];
    const author = users.get(row.author_id);
    if (!author?.username || !author.name) return [];
    const reference = (type: string) =>
      row.referenced_tweets?.find((item) => item.type === type)?.id;
    const normalizedMedia = (row.attachments?.media_keys ?? []).flatMap(
      (key): XMedia[] => {
        const item = media.get(key);
        if (
          !item ||
          !["photo", "video", "animated_gif"].includes(item.type ?? "")
        ) {
          return [];
        }
        return [
          {
            type: item.type as XMedia["type"],
            url: item.url,
            previewImageUrl: item.preview_image_url,
            altText: item.alt_text,
          },
        ];
      },
    );
    return [
      {
        id: row.id,
        url: `https://x.com/${author.username}/status/${row.id}`,
        text: row.note_tweet?.text ?? row.text ?? "",
        author: {
          id: row.author_id,
          username: author.username,
          name: author.name,
        },
        createdAt: row.created_at,
        language: row.lang,
        conversationId: row.conversation_id,
        quotedPostId: reference("quoted"),
        parentPostId: reference("replied_to"),
        canonicalLinks: [
          ...new Set(
            (row.entities?.urls ?? [])
              .map((item) => item.expanded_url)
              .filter((value): value is string => Boolean(value)),
          ),
        ],
        metrics: {
          likes: row.public_metrics?.like_count ?? 0,
          reposts: row.public_metrics?.retweet_count ?? 0,
          replies: row.public_metrics?.reply_count ?? 0,
          quotes: row.public_metrics?.quote_count ?? 0,
        },
        media: normalizedMedia,
      },
    ];
  });
}

function safeApiError(response: Response) {
  if (response.status === 401) {
    return new XApiError("x_reconnect_required");
  }
  if (response.status === 402) {
    return new XApiError("x_api_billing_unavailable");
  }
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("retry-after"));
    return new XApiError(
      "x_rate_limited",
      Number.isFinite(retryAfter) ? retryAfter : undefined,
    );
  }
  return new XApiError("x_post_unavailable");
}

export function createXApiClient(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): XApiClient {
  async function request(url: URL) {
    const response = await fetchImpl(url, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw safeApiError(response);
    try {
      return (await response.json()) as XApiEnvelope;
    } catch {
      throw new XApiError("x_post_unavailable");
    }
  }

  async function requestPosts(url: URL) {
    return normalizePosts(await request(url));
  }

  return {
    async getPost(id) {
      assertPostId(id);
      const url = new URL(`https://api.x.com/2/tweets/${id}`);
      addPostFields(url.searchParams);
      const [post] = await requestPosts(url);
      if (!post) throw new XApiError("x_post_unavailable");
      return post;
    },

    async getPosts(ids) {
      if (ids.length === 0) return [];
      if (ids.length > 100) throw new XApiError("x_post_unavailable");
      ids.forEach(assertPostId);
      const url = new URL("https://api.x.com/2/tweets");
      url.searchParams.set("ids", ids.join(","));
      addPostFields(url.searchParams);
      return requestPosts(url);
    },

    async searchRecent(input) {
      const url = new URL("https://api.x.com/2/tweets/search/recent");
      url.searchParams.set("query", input.query);
      url.searchParams.set("start_time", input.startTime.toISOString());
      url.searchParams.set(
        "max_results",
        String(Math.min(100, Math.max(10, input.maxResults))),
      );
      if (input.sortOrder) {
        url.searchParams.set("sort_order", input.sortOrder);
      }
      addPostFields(url.searchParams);
      return requestPosts(url);
    },

    async getPersonalizedTrends() {
      const url = new URL("https://api.x.com/2/users/personalized_trends");
      url.searchParams.set(
        "personalized_trend.fields",
        "category,post_count,trend_name,trending_since",
      );
      let envelope: XApiEnvelope;
      try {
        envelope = await request(url);
      } catch (error) {
        if (
          error instanceof XApiError &&
          error.code === "x_reconnect_required"
        ) {
          throw new XApiError("x_personalized_trends_unavailable");
        }
        throw error;
      }
      if (!Array.isArray(envelope.data)) return [];
      return envelope.data.filter(isPersonalizedTrend).flatMap(
        (trend): PersonalizedTrend[] =>
          trend.trend_name
            ? [
                {
                  name: trend.trend_name,
                  category: trend.category,
                  postCount: trend.post_count,
                  trendingSince: trend.trending_since,
                },
              ]
            : [],
      );
    },

    async getMe() {
      const url = new URL("https://api.x.com/2/users/me");
      url.searchParams.set("user.fields", "id");
      const envelope = await request(url);
      if (
        !isRecord(envelope.data) ||
        typeof envelope.data.id !== "string"
      ) {
        throw new XApiError("x_reconnect_required");
      }
      return { id: envelope.data.id };
    },

    async getFollowingTimeline(input) {
      assertPostId(input.userId);
      const url = new URL(
        `https://api.x.com/2/users/${input.userId}/timelines/reverse_chronological`,
      );
      url.searchParams.set("start_time", input.startTime.toISOString());
      url.searchParams.set(
        "max_results",
        String(Math.min(100, Math.max(1, input.maxResults))),
      );
      url.searchParams.set("exclude", "replies");
      addPostFields(url.searchParams);
      return requestPosts(url);
    },
  };
}
