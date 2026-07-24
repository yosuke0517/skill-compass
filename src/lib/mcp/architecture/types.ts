export const claimStatuses = ["implemented", "operational", "planned"] as const;
export type ClaimStatus = (typeof claimStatuses)[number];

export const architectureTopics = [
  "system",
  "data_flow",
  "deployment",
  "components",
] as const;
export type ArchitectureTopic = (typeof architectureTopics)[number];

export const securityTopics = [
  "mcp",
  "authentication",
  "authorization",
  "secrets",
  "pii",
  "deployment",
] as const;
export type SecurityTopic = (typeof securityTopics)[number];

export const interviewDepths = ["brief", "standard", "deep_dive"] as const;
export type InterviewDepth = (typeof interviewDepths)[number];

export type ArchitectureClaim = {
  id: string;
  status: ClaimStatus;
  topics: string[];
  statement: string;
  reasoning: string;
  limitation?: string;
  evidence: string[];
};

export type ArchitectureComponent = {
  id: string;
  name: string;
  responsibility: string;
};

export type ArchitectureManifest = {
  version: string;
  productSummary: string;
  topology: string[];
  components: ArchitectureComponent[];
  claims: ArchitectureClaim[];
  followUpQuestions: string[];
};
