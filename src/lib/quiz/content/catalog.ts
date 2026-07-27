import type { LearningCategory } from "@/lib/quiz/content/types";

export const learningCatalog = [
  {
    id: "cs_foundations",
    name: "Computer Science Foundations",
    subtopics: [
      { id: "data_structures", name: "Data structures" },
      { id: "algorithms", name: "Algorithms" },
      { id: "operating_systems", name: "Operating systems" },
      { id: "networking", name: "Networking" },
      { id: "databases", name: "Databases" },
    ],
  },
  {
    id: "web_backend",
    name: "Web and Backend",
    subtopics: [
      { id: "http", name: "HTTP" },
      { id: "apis", name: "APIs" },
      { id: "authentication", name: "Authentication" },
      { id: "caching", name: "Caching" },
      { id: "async_processing", name: "Async processing" },
    ],
  },
  {
    id: "frontend",
    name: "Frontend Engineering",
    subtopics: [
      { id: "typescript", name: "TypeScript" },
      { id: "browsers", name: "Browsers" },
      { id: "state_management", name: "State management" },
      { id: "accessibility", name: "Accessibility" },
    ],
  },
  {
    id: "infrastructure",
    name: "Infrastructure",
    subtopics: [
      { id: "cloud", name: "Cloud" },
      { id: "containers", name: "Containers" },
      { id: "ci_cd", name: "CI/CD" },
      { id: "observability", name: "Observability" },
    ],
  },
  {
    id: "security",
    name: "Security",
    subtopics: [
      { id: "authorization", name: "Authorization" },
      { id: "vulnerabilities", name: "Vulnerabilities" },
      { id: "secret_handling", name: "Secret handling" },
      { id: "supply_chain", name: "Supply chain" },
    ],
  },
  {
    id: "software_design",
    name: "Software Design",
    subtopics: [
      { id: "distributed_systems", name: "Distributed systems" },
      { id: "maintainability", name: "Maintainability" },
      { id: "tradeoffs", name: "Tradeoffs" },
    ],
  },
  {
    id: "ai_engineering",
    name: "AI Engineering",
    subtopics: [
      { id: "llms", name: "LLMs" },
      { id: "rag", name: "RAG" },
      { id: "agents", name: "Agents" },
      { id: "mcp", name: "MCP" },
      { id: "evaluation", name: "Evaluation" },
      { id: "safety", name: "Safety" },
    ],
  },
] as const satisfies readonly LearningCategory[];
