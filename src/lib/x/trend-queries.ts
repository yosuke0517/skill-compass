import { technicalTerms } from "@/lib/x/topics";
import type { PersonalizedTrend } from "@/lib/x/types";

const safeTrendPattern = /^[\p{L}\p{N} .+#_-]+$/u;

export const xFixedTopicFallbackQuery = [
  "(",
  'AI OR LLM OR "developer tooling" OR agent',
  "OR frontend OR backend OR database OR PostgreSQL OR React",
  "OR cloud OR Kubernetes OR observability OR distributed",
  "OR security OR vulnerability OR CVE OR authentication OR privacy",
  ") -is:retweet -is:reply",
].join(" ");

const excludeNoise = "-is:retweet -is:reply";

export const xDailyUpdateQueries = [
  [
    '(Claude OR "Claude Code" OR Anthropic OR OpenAI OR ChatGPT OR Codex OR Gemini OR "Google AI" OR Grok OR xAI OR MCP)',
    '("new feature" OR released OR launches OR "now available" OR API OR SDK OR model OR pricing OR limits)',
    excludeNoise,
  ].join(" "),
  [
    '(GitHub OR Copilot OR "Next.js" OR React OR TypeScript OR Rails OR AWS OR Cloudflare)',
    '("new feature" OR released OR launches OR API OR SDK OR breaking OR deprecated OR migration OR pricing)',
    excludeNoise,
  ].join(" "),
  [
    '(Claude OR Anthropic OR OpenAI OR ChatGPT OR Codex OR Gemini OR Grok OR xAI OR "Next.js" OR React OR TypeScript OR Rails OR npm OR GitHub OR AWS OR Cloudflare OR MCP)',
    '(CVE OR "security advisory" OR vulnerability OR patch OR "supply chain" OR preinstall OR postinstall OR "authentication bypass" OR RCE)',
    excludeNoise,
  ].join(" "),
] as const;

function isTechnicalTrend(trend: PersonalizedTrend) {
  const searchable = `${trend.name} ${trend.category ?? ""}`.toLowerCase();
  return technicalTerms.some((term) => searchable.includes(term));
}

export function selectTechnicalTrends(trends: PersonalizedTrend[], limit: number) {
  const boundedLimit = Math.max(0, limit);
  if (boundedLimit === 0) return [];
  const seen = new Set<string>();
  const selected: string[] = [];
  for (const trend of trends) {
    const name = trend.name.trim().replace(/\s+/g, " ");
    const key = name.toLowerCase();
    if (
      !name ||
      name.length > 80 ||
      !safeTrendPattern.test(name) ||
      seen.has(key) ||
      !isTechnicalTrend({ ...trend, name })
    ) {
      continue;
    }
    seen.add(key);
    selected.push(name);
    if (selected.length >= boundedLimit) break;
  }
  return selected;
}

export function buildTrendSearchQuery(trend: string) {
  const normalized = trend.trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length > 80 || !safeTrendPattern.test(normalized)) {
    throw new Error("unsafe_x_trend");
  }
  return `"${normalized}" -is:retweet -is:reply`;
}
