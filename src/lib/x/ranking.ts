import { technicalTerms } from "@/lib/x/topics";
import type { PublicXPost, RankedTechPost } from "@/lib/x/types";

export type TechPostCandidate = {
  post: PublicXPost;
  source: "public_search" | "following_timeline";
};

export type RankedCandidate = {
  post: RankedTechPost;
  source: TechPostCandidate["source"];
};

const excludedPatterns = [
  /\b(?:we(?:'re| are)? hiring|apply now|job opening)\b/i,
  /\b(?:like and repost|retweet if|follow me)\b/i,
  /\b(?:bitcoin|btc|ethereum|eth)\b.{0,30}\b(?:price|moon|pump)\b/i,
  /\b(?:buy now|referral code|limited offer)\b/i,
];
const securityPattern =
  /\b(?:CVE-\d{4}-\d+|authentication bypass|security advisory|vendor patch|patch available|incident report|supply[- ]chain attack)\b/i;

function normalizedText(text: string) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function isTechnical(text: string) {
  const lower = text.toLowerCase();
  return technicalTerms.some((term) => lower.includes(term));
}

function scorePost(post: PublicXPost, now: Date) {
  const reasons: string[] = [];
  const ageHours = Math.max(
    0,
    (now.getTime() - new Date(post.createdAt).getTime()) / 3_600_000,
  );
  const recency = Math.max(0, 24 - ageHours) / 4;
  const engagement =
    Math.log1p(Math.min(post.metrics.likes, 10_000)) * 1.2 +
    Math.log1p(Math.min(post.metrics.reposts, 3_000)) * 1.8 +
    Math.log1p(Math.min(post.metrics.replies, 1_000)) * 0.6 +
    Math.log1p(Math.min(post.metrics.quotes, 1_000));
  let score = recency + engagement + 10;
  if (securityPattern.test(post.text)) {
    score += 100;
    reasons.push("concrete_security_update");
  }
  reasons.push("technical_relevance", "recent_public_post");
  return { score, reasons };
}

export function rankTechPosts(input: {
  candidates: TechPostCandidate[];
  limit: number;
  now: Date;
}): RankedCandidate[] {
  const seenIds = new Set<string>();
  const seenTexts = new Set<string>();
  const seenLinks = new Set<string>();
  const eligible: RankedCandidate[] = [];

  for (const candidate of input.candidates) {
    const text = normalizedText(candidate.post.text);
    if (
      !text ||
      seenIds.has(candidate.post.id) ||
      seenTexts.has(text) ||
      excludedPatterns.some((pattern) => pattern.test(text)) ||
      (!isTechnical(text) && !securityPattern.test(text))
    ) {
      continue;
    }
    const links = candidate.post.canonicalLinks;
    if (links.some((link) => seenLinks.has(link))) continue;
    const { score, reasons } = scorePost(candidate.post, input.now);
    seenIds.add(candidate.post.id);
    seenTexts.add(text);
    links.forEach((link) => seenLinks.add(link));
    eligible.push({
      source: candidate.source,
      post: { ...candidate.post, score, reasons },
    });
  }

  eligible.sort(
    (left, right) =>
      right.post.score - left.post.score ||
      left.post.id.localeCompare(right.post.id),
  );
  const limit = Math.max(0, Math.min(10, input.limit));
  const publicTarget = Math.ceil(limit * 0.7);
  const timelineTarget = limit - publicTarget;
  const publicPosts = eligible.filter(
    (item) => item.source === "public_search",
  );
  const timelinePosts = eligible.filter(
    (item) => item.source === "following_timeline",
  );
  const selected = [
    ...publicPosts.slice(0, publicTarget),
    ...timelinePosts.slice(0, timelineTarget),
  ];
  const selectedIds = new Set(selected.map((item) => item.post.id));
  selected.push(
    ...eligible
      .filter((item) => !selectedIds.has(item.post.id))
      .slice(0, limit - selected.length),
  );
  return selected
    .sort(
      (left, right) =>
        right.post.score - left.post.score ||
        left.post.id.localeCompare(right.post.id),
    )
    .slice(0, limit);
}
