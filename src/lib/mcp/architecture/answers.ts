import { detectResponseLanguage } from "@/lib/language/detect-response-language";
import { validateArchitectureManifest } from "@/lib/mcp/architecture/manifest-validator";
import type {
  ArchitectureClaim,
  ArchitectureComponent,
  ArchitectureManifest,
  ArchitectureTopic,
  ClaimStatus,
  InterviewDepth,
  SecurityTopic,
} from "@/lib/mcp/architecture/types";

export type PublicClaim = {
  id: string;
  status: ClaimStatus;
  statement: string;
  reasoning: string;
  limitation?: string;
  evidence: string[];
};

const topicKeywords: Array<{ topic: string; keywords: string[] }> = [
  {
    topic: "mcp",
    keywords: ["mcp", "tool", "prompt injection", "ツール", "プロンプト"],
  },
  {
    topic: "authentication",
    keywords: ["auth", "oauth", "pkce", "login", "認証", "ログイン"],
  },
  {
    topic: "authorization",
    keywords: ["authorization", "permission", "user id", "認可", "権限"],
  },
  {
    topic: "secrets",
    keywords: ["secret", "token", "keychain", "credential", "秘匿", "秘密"],
  },
  {
    topic: "pii",
    keywords: ["pii", "personal", "privacy", "個人情報", "プライバシー"],
  },
  {
    topic: "deployment",
    keywords: [
      "deploy",
      "cloudflare",
      "tunnel",
      "hosting",
      "デプロイ",
      "構成",
    ],
  },
  {
    topic: "data_flow",
    keywords: [
      "data flow",
      "today",
      "podcast",
      "lesson",
      "voice",
      "live",
      "x news",
      "データフロー",
      "データ",
      "教材",
      "学習",
      "音声",
    ],
  },
  {
    topic: "system",
    keywords: ["architecture", "component", "system", "設計", "アーキテクチャ"],
  },
  {
    topic: "future",
    keywords: [
      "future",
      "planned",
      "roadmap",
      "diagnostic",
      "exam",
      "cloud",
      "将来",
      "計画",
      "診断",
      "模試",
      "クラウド",
    ],
  },
];

export function getArchitectureOverview(input: {
  manifest: ArchitectureManifest;
  focus: ArchitectureTopic;
  latestUserMessage?: string;
}): {
  focus: ArchitectureTopic;
  productSummary: string;
  currentArchitecture: string[];
  components: ArchitectureComponent[];
  currentTradeoffs: PublicClaim[];
  responseLanguage: "en" | "ja";
} {
  validateArchitectureManifest(input.manifest);
  const claims = currentClaims(input.manifest).filter((claim) =>
    claim.topics.includes(input.focus),
  );
  return {
    focus: input.focus,
    productSummary: input.manifest.productSummary,
    currentArchitecture: [...input.manifest.topology],
    components: input.manifest.components.map((component) => ({ ...component })),
    currentTradeoffs: claims.map(publicClaim),
    responseLanguage: detectResponseLanguage(input.latestUserMessage ?? ""),
  };
}

export function explainSecurityAndPrivacy(input: {
  manifest: ArchitectureManifest;
  topic: SecurityTopic;
  latestUserMessage?: string;
}): {
  topic: SecurityTopic;
  controls: PublicClaim[];
  whyTheyReduceRisk: Array<{ id: string; reasoning: string }>;
  limitations: Array<{ id: string; limitation: string }>;
  residualRisks: string[];
  plannedImprovements: PublicClaim[];
  responseLanguage: "en" | "ja";
} {
  validateArchitectureManifest(input.manifest);
  const relevant = input.manifest.claims.filter((claim) =>
    claim.topics.includes(input.topic),
  );
  const controls = relevant.filter((claim) => claim.status !== "planned");
  return {
    topic: input.topic,
    controls: controls.map(publicClaim),
    whyTheyReduceRisk: controls.map(({ id, reasoning }) => ({ id, reasoning })),
    limitations: controls.flatMap((claim) =>
      claim.limitation
        ? [{ id: claim.id, limitation: claim.limitation }]
        : [],
    ),
    residualRisks: controls.flatMap((claim) =>
      claim.limitation ? [claim.limitation] : [],
    ),
    plannedImprovements: relevant
      .filter((claim) => claim.status === "planned")
      .map(publicClaim),
    responseLanguage: detectResponseLanguage(input.latestUserMessage ?? ""),
  };
}

export function answerTechnicalInterviewQuestion(input: {
  manifest: ArchitectureManifest;
  question: string;
  depth: InterviewDepth;
  latestUserMessage?: string;
}): {
  directAnswer: string;
  currentFacts: PublicClaim[];
  designReasoningAndTradeoffs: Array<{
    id: string;
    reasoning: string;
    limitation?: string;
  }>;
  plannedImprovements: PublicClaim[];
  followUpPoints: string[];
  responseLanguage: "en" | "ja";
} {
  validateArchitectureManifest(input.manifest);
  const topics = matchTopics(input.question);
  const matchingClaims = input.manifest.claims.filter((claim) =>
    claim.topics.some((topic) => topics.has(topic)),
  );
  const candidates =
    matchingClaims.length > 0
      ? matchingClaims
      : input.manifest.claims.filter((claim) =>
          claim.topics.includes("interview"),
        );
  const limits = {
    brief: { current: 2, planned: 1, followUps: 2 },
    standard: { current: 5, planned: 2, followUps: 3 },
    deep_dive: {
      current: Number.POSITIVE_INFINITY,
      planned: Number.POSITIVE_INFINITY,
      followUps: 4,
    },
  }[input.depth];
  const current = candidates
    .filter((claim) => claim.status !== "planned")
    .slice(0, limits.current);
  const planned = candidates
    .filter((claim) => claim.status === "planned")
    .slice(0, limits.planned);

  return {
    directAnswer: current.map((claim) => claim.statement).join(" "),
    currentFacts: current.map(publicClaim),
    designReasoningAndTradeoffs: current.map(
      ({ id, reasoning, limitation }) => ({
        id,
        reasoning,
        ...(limitation ? { limitation } : {}),
      }),
    ),
    plannedImprovements: planned.map(publicClaim),
    followUpPoints: input.manifest.followUpQuestions.slice(0, limits.followUps),
    responseLanguage: detectResponseLanguage(
      input.latestUserMessage ?? input.question,
    ),
  };
}

function currentClaims(manifest: ArchitectureManifest): ArchitectureClaim[] {
  return manifest.claims.filter((claim) => claim.status !== "planned");
}

function publicClaim(claim: ArchitectureClaim): PublicClaim {
  return {
    id: claim.id,
    status: claim.status,
    statement: claim.statement,
    reasoning: claim.reasoning,
    ...(claim.limitation ? { limitation: claim.limitation } : {}),
    evidence: [...claim.evidence],
  };
}

function matchTopics(question: string): Set<string> {
  const normalized = question.toLocaleLowerCase();
  const topics = new Set<string>();
  for (const entry of topicKeywords) {
    if (entry.keywords.some((keyword) => normalized.includes(keyword))) {
      topics.add(entry.topic);
    }
  }
  return topics;
}
