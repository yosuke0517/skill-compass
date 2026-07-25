export type XPostMetrics = {
  likes: number;
  reposts: number;
  replies: number;
  quotes: number;
};

export type PersonalizedTrend = {
  name: string;
  category?: string;
  postCount?: number;
  trendingSince?: string;
};

export type XMedia = {
  type: "photo" | "video" | "animated_gif";
  url?: string;
  previewImageUrl?: string;
  altText?: string;
};

export type PublicXPost = {
  id: string;
  url: string;
  text: string;
  author: { id: string; username: string; name: string };
  createdAt: string;
  language?: string;
  conversationId?: string;
  quotedPostId?: string;
  parentPostId?: string;
  canonicalLinks: string[];
  metrics: XPostMetrics;
  media: XMedia[];
};

export type RankedTechPost = PublicXPost & {
  score: number;
  reasons: string[];
};

export type XServiceErrorCode =
  | "invalid_x_post_url"
  | "x_reconnect_required"
  | "x_post_unavailable"
  | "x_rate_limited"
  | "x_api_billing_unavailable"
  | "x_personalized_trends_unavailable";
