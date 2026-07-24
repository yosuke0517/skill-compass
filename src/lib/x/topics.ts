export const xTechTopics = [
  "AI, LLMs, agents, and developer tooling",
  "frontend, backend, databases, and Web engineering",
  "cloud infrastructure, observability, and distributed systems",
  "application security, vulnerabilities, authentication, authorization, privacy, and supply-chain security",
] as const;

export const xRecentSearchQuery = [
  '(AI OR LLM OR "developer tooling" OR agent)',
  "(frontend OR backend OR database OR PostgreSQL OR React)",
  "(cloud OR Kubernetes OR observability OR distributed)",
  "(security OR vulnerability OR CVE OR authentication OR privacy)",
].join(" ");

export const technicalTerms = [
  "ai",
  "llm",
  "agent",
  "developer",
  "tooling",
  "frontend",
  "backend",
  "web",
  "react",
  "database",
  "postgres",
  "mysql",
  "cloud",
  "kubernetes",
  "observability",
  "tracing",
  "distributed",
  "security",
  "vulnerability",
  "cve-",
  "authentication",
  "authorization",
  "passkey",
  "privacy",
  "compiler",
  "query",
  "api",
  "patch",
] as const;
