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

const officialAccounts = new Set(
  [
    "anthropicai",
    "claudeai",
    "openai",
    "openaidevs",
    "chatgptapp",
    "googleai",
    "googledeepmind",
    "geminiapp",
    "xai",
    "grok",
    "github",
    "githubchangelog",
    "githubcopilot",
    "nextjs",
    "vercel",
    "reactjs",
    "typescript",
    "rails",
    "awscloud",
    "awsdevelopers",
    "cloudflare",
    "cloudflaredev",
  ].map((username) => username.toLowerCase()),
);

const excludedPatterns = [
  /\b(?:we(?:'re| are)? hiring|apply now|job opening)\b/i,
  /\b(?:like and repost|retweet if)\b/i,
  /\b(?:buy now|referral code|limited offer|presale|airdrop)\b/i,
  /\b(?:follow (?:me|and)|dm me|link in bio|join (?:my|our) (?:community|discord|telegram))\b/i,
  /\b(?:made|earned|make|earn)\b.{0,30}\b(?:million yen|\$\d+|per month|a month|monthly)\b/i,
  /\b(?:anyone can|passive income|get rich|secret method|side hustle)\b/i,
  /\b(?:token sale|crypto token|bitcoin|btc|ethereum|eth)\b.{0,40}\b(?:launch|price|moon|pump|buy|presale)\b/i,
  /\b(?:seed round|series [a-z]|funding round|(?:raised|raises?)\s+(?:\$|¥|€)\s?\d|(?:raised|raises?).{0,30}(?:funding|capital|round))\b/i,
];

const genericExplanationPattern =
  /\b(?:what is|beginner(?:'s)? guide|complete guide|explained|deep dive|architecture patterns?|tips and tricks|best practices)\b/i;
const securityPattern =
  /\b(?:CVE-\d{4}-\d+|authentication bypass|security advisory|vendor patch|patch available|incident report|supply[- ]chain attack|remote code execution|RCE|zero[- ]day|actively exploited|vulnerabilit(?:y|ies) (?:in|affecting|fixed|patched|disclosed))\b/i;
const newFeaturePattern =
  /\b(?:new feature|now supports?|introduc(?:e|es|ed|ing)|adds?|launch(?:es|ed)?|roll(?:s|ed)? out|now available)\b/i;
const releasePattern =
  /\b(?:release[sd]?|version\s+\d|v\d+(?:\.\d+)+|shipped|generally available|GA)\b/i;
const apiUpdatePattern =
  /\b(?:API|SDK)\b.{0,60}\b(?:new|update[sd]?|release[sd]?|launch(?:es|ed)?|available|adds?|support)\b|\b(?:new|updated?)\b.{0,40}\b(?:API|SDK)\b/i;
const breakingChangePattern =
  /\b(?:breaking change|deprecated?|deprecation|migration required|removed?|sunset)\b/i;
const pricingPattern =
  /\b(?:pricing|price change|usage limits?|rate limits?|plan change|billing|marketplace|monetization|revenue sharing)\b/i;
const priorityProductPattern =
  /\b(?:Claude(?: Code)?|Anthropic|OpenAI|ChatGPT|Codex|Gemini|Google AI|Grok|xAI|GitHub(?: Copilot)?|Next\.js|React|TypeScript|Rails|AWS|Cloudflare|MCP)\b/i;

const newsReasons = new Set([
  "new_feature",
  "new_release",
  "api_update",
  "breaking_change",
  "pricing_or_limit_change",
  "security_incident",
]);

function normalizedText(text: string) {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}.#+-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isTechnical(text: string) {
  const lower = text.toLowerCase();
  return technicalTerms.some((term) => lower.includes(term));
}

function classify(post: PublicXPost) {
  const reasons: string[] = [];
  const text = post.text;
  if (securityPattern.test(text)) reasons.push("security_incident");
  if (newFeaturePattern.test(text)) reasons.push("new_feature");
  if (releasePattern.test(text)) reasons.push("new_release");
  if (apiUpdatePattern.test(text)) reasons.push("api_update");
  if (breakingChangePattern.test(text)) reasons.push("breaking_change");
  if (pricingPattern.test(text)) reasons.push("pricing_or_limit_change");
  if (officialAccounts.has(post.author.username.toLowerCase())) {
    reasons.push("official_announcement", "primary_source");
  }
  if (priorityProductPattern.test(text)) reasons.push("priority_product");
  reasons.push("recent");
  return reasons;
}

function scorePost(post: PublicXPost, reasons: string[], now: Date) {
  const ageHours = Math.max(0, (now.getTime() - new Date(post.createdAt).getTime()) / 3_600_000);
  const recency = Math.max(0, 24 - ageHours) / 2;
  const rawEngagement =
    Math.log1p(Math.min(post.metrics.likes, 10_000)) * 1.2 +
    Math.log1p(Math.min(post.metrics.reposts, 3_000)) * 1.8 +
    Math.log1p(Math.min(post.metrics.replies, 1_000)) * 0.6 +
    Math.log1p(Math.min(post.metrics.quotes, 1_000)) +
    Math.log1p(Math.min(post.metrics.bookmarks ?? 0, 10_000)) * 0.8 +
    Math.log1p(Math.min(post.metrics.views ?? 0, 10_000_000)) * 0.5;
  const weights: Record<string, number> = {
    security_incident: 50,
    breaking_change: 42,
    api_update: 32,
    new_feature: 30,
    new_release: 28,
    pricing_or_limit_change: 24,
    official_announcement: 25,
    primary_source: 10,
    priority_product: 12,
  };
  return (
    recency +
    Math.min(15, rawEngagement) +
    reasons.reduce((sum, reason) => sum + (weights[reason] ?? 0), 0)
  );
}

function productKey(text: string) {
  const products: Array<[RegExp, string]> = [
    [/claude(?: code)?|anthropic/i, "claude"],
    [/openai|chatgpt|codex/i, "openai"],
    [/gemini|google ai/i, "gemini"],
    [/grok|xai/i, "grok"],
    [/github(?: copilot)?/i, "github"],
    [/next\.js/i, "nextjs"],
    [/react/i, "react"],
    [/typescript/i, "typescript"],
    [/rails/i, "rails"],
    [/\baws\b/i, "aws"],
    [/cloudflare/i, "cloudflare"],
    [/\bmcp\b/i, "mcp"],
    [/\bnpm\b/i, "npm"],
  ];
  return products.find(([pattern]) => pattern.test(text))?.[1];
}

const topicStopWords = new Set([
  "the",
  "and",
  "with",
  "for",
  "from",
  "that",
  "this",
  "new",
  "now",
  "today",
  "breaking",
  "launches",
  "launch",
  "released",
  "release",
  "adds",
  "add",
  "openai",
  "chatgpt",
  "codex",
  "claude",
  "anthropic",
  "github",
  "next.js",
  "api",
]);

function topicTokens(text: string) {
  return new Set(
    normalizedText(text)
      .split(" ")
      .filter((token) => token.length >= 3 && !topicStopWords.has(token)),
  );
}

function isSameAnnouncement(left: PublicXPost, right: PublicXPost) {
  if (left.canonicalLinks.some((link) => right.canonicalLinks.includes(link))) {
    return true;
  }
  const leftCve = left.text.match(/CVE-\d{4}-\d+/i)?.[0].toLowerCase();
  const rightCve = right.text.match(/CVE-\d{4}-\d+/i)?.[0].toLowerCase();
  if (leftCve || rightCve) {
    return leftCve !== undefined && leftCve === rightCve;
  }
  const leftProduct = productKey(left.text);
  if (!leftProduct || leftProduct !== productKey(right.text)) return false;
  const leftTokens = topicTokens(left.text);
  const rightTokens = topicTokens(right.text);
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const smaller = Math.min(leftTokens.size, rightTokens.size);
  return smaller > 0 && intersection / smaller >= 0.5;
}

function preferRepresentative(left: RankedCandidate, right: RankedCandidate) {
  const leftOfficial = left.post.reasons.includes("official_announcement");
  const rightOfficial = right.post.reasons.includes("official_announcement");
  if (leftOfficial !== rightOfficial) return leftOfficial ? left : right;
  return left.post.score >= right.post.score ? left : right;
}

export function rankTechPosts(input: {
  candidates: TechPostCandidate[];
  limit: number;
  now: Date;
}): RankedCandidate[] {
  const seenIds = new Set<string>();
  const seenTexts = new Set<string>();
  const eligible: RankedCandidate[] = [];

  for (const candidate of input.candidates) {
    const text = normalizedText(candidate.post.text);
    if (!text || seenIds.has(candidate.post.id) || seenTexts.has(text)) continue;
    if (excludedPatterns.some((pattern) => pattern.test(candidate.post.text))) continue;
    const reasons = classify(candidate.post);
    const hasNews = reasons.some((reason) => newsReasons.has(reason));
    const isOfficial = reasons.includes("official_announcement");
    if (
      !hasNews ||
      (genericExplanationPattern.test(candidate.post.text) &&
        !isOfficial &&
        !securityPattern.test(candidate.post.text))
    ) {
      continue;
    }
    if (
      !isTechnical(candidate.post.text) &&
      !priorityProductPattern.test(candidate.post.text) &&
      !securityPattern.test(candidate.post.text)
    ) {
      continue;
    }
    const engagementTotal =
      candidate.post.metrics.likes +
      candidate.post.metrics.reposts * 2 +
      candidate.post.metrics.replies +
      candidate.post.metrics.quotes * 2;
    const isPrimaryUpdate =
      reasons.includes("primary_source") || reasons.includes("security_incident");
    const meetsPopularityThreshold =
      candidate.post.metrics.likes >= 10 ||
      candidate.post.metrics.reposts >= 5 ||
      candidate.post.metrics.quotes >= 2 ||
      engagementTotal >= 25;
    if (!meetsPopularityThreshold && !isPrimaryUpdate) continue;

    const ranked: RankedCandidate = {
      source: candidate.source,
      post: {
        ...candidate.post,
        score: scorePost(candidate.post, reasons, input.now),
        reasons,
      },
    };
    const duplicateIndex = eligible.findIndex((item) => isSameAnnouncement(item.post, ranked.post));
    if (duplicateIndex >= 0) {
      eligible[duplicateIndex] = preferRepresentative(eligible[duplicateIndex], ranked);
    } else {
      eligible.push(ranked);
    }
    seenIds.add(candidate.post.id);
    seenTexts.add(text);
  }

  eligible.sort(
    (left, right) =>
      right.post.score - left.post.score || left.post.id.localeCompare(right.post.id),
  );
  const limit = Math.max(0, Math.min(10, input.limit));
  const productCounts = new Map<string, number>();
  const diverse: RankedCandidate[] = [];
  for (const item of eligible) {
    const product = productKey(item.post.text);
    const isSecurity = item.post.reasons.includes("security_incident");
    if (product && !isSecurity && (productCounts.get(product) ?? 0) >= 2) continue;
    diverse.push(item);
    if (product && !isSecurity) {
      productCounts.set(product, (productCounts.get(product) ?? 0) + 1);
    }
    if (diverse.length >= limit) break;
  }
  return diverse;
}
