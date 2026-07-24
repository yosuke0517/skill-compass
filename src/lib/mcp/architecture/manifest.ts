import type { ArchitectureManifest } from "@/lib/mcp/architecture/types";

export const architectureManifest = {
  version: "2026-07-24",
  productSummary:
    "Skill Compass is a personal engineering-learning application that combines daily quizzes, source-grounded learning history, and generated Podcast briefings.",
  topology: [
    "ChatGPT and the web UI enter through separate authenticated application boundaries.",
    "The Next.js application owns HTTP routing and delegates learning behavior to shared domain services.",
    "MySQL stores application state; object storage holds generated audio; provider APIs support generation and source collection.",
    "A private HTTPS tunnel publishes only the application endpoint while local database and worker interfaces remain unexposed.",
  ],
  components: [
    {
      id: "web-application",
      name: "Next.js application",
      responsibility:
        "Serves the web UI, OAuth endpoints, MCP resources, and application APIs.",
    },
    {
      id: "learning-services",
      name: "Shared learning services",
      responsibility:
        "Centralize authorization, validation, scoring, Podcast access, and persistence for web and MCP callers.",
    },
    {
      id: "relational-store",
      name: "MySQL",
      responsibility:
        "Stores users, learning state, Podcast metadata, conversations, and OAuth records.",
    },
    {
      id: "object-storage",
      name: "Object storage",
      responsibility:
        "Stores generated Podcast audio without exposing storage credentials through MCP.",
    },
    {
      id: "background-worker",
      name: "Podcast worker",
      responsibility:
        "Processes queued generation separately from interactive HTTP requests.",
    },
  ],
  claims: [
    {
      id: "shared-domain-boundary",
      status: "implemented",
      topics: ["system", "components", "data_flow", "interview"],
      statement:
        "Web and learning MCP flows call shared Today and Podcast services.",
      reasoning:
        "This prevents a second scoring or Podcast-answering implementation from drifting from web behavior.",
      evidence: [
        "Today service boundary",
        "Podcast service boundary",
        "Learning MCP server",
      ],
    },
    {
      id: "mcp-oauth-pkce",
      status: "implemented",
      topics: ["mcp", "authentication", "security", "interview"],
      statement:
        "The MCP connection uses authorization-code OAuth with PKCE S256 and bearer-token authentication.",
      reasoning:
        "ChatGPT does not receive or reuse the browser session cookie, and intercepted authorization codes cannot be redeemed without the verifier.",
      limitation:
        "The initial private deployment shares one issuer and does not yet use audience-scoped tokens per MCP resource.",
      evidence: [
        "OAuth metadata",
        "Authorization endpoint",
        "Token endpoint",
        "Bearer authentication service",
      ],
    },
    {
      id: "single-user-authorization",
      status: "implemented",
      topics: ["authorization", "mcp", "pii", "security", "interview"],
      statement:
        "Bearer authentication is bound to one configured active Skill Compass user, and learning tools do not accept an arbitrary user ID.",
      reasoning:
        "A caller cannot select another account through tool arguments, and domain services enforce resource ownership.",
      limitation:
        "This is suitable for the current private deployment but would need tenant-aware policy for a multi-user product.",
      evidence: [
        "Bearer authentication service",
        "Learning MCP tool schemas",
        "Domain ownership checks",
      ],
    },
    {
      id: "secret-storage",
      status: "implemented",
      topics: ["secrets", "security", "interview"],
      statement:
        "Provider secrets are loaded from deployment configuration or the operating-system credential store, and provider OAuth tokens are encrypted before database persistence.",
      reasoning:
        "Secret values stay outside MCP responses and are not stored as plain application content.",
      limitation:
        "Host compromise or an unsafe future code path could still expose process-accessible secrets.",
      evidence: [
        "Environment schema",
        "Credential-store integration",
        "OAuth token encryption",
      ],
    },
    {
      id: "learning-mcp-minimization",
      status: "implemented",
      topics: ["mcp", "pii", "security", "data_flow", "interview"],
      statement:
        "Learning MCP tools return bounded domain DTOs and omit correctness metadata for unanswered quizzes, storage credentials, and audio internals.",
      reasoning:
        "The client receives only the fields required for the requested learning interaction.",
      limitation:
        "Podcast transcripts and quiz reasoning are personal content intentionally returned when the authenticated owner requests them.",
      evidence: [
        "Learning MCP contracts",
        "Today service DTO",
        "Podcast service DTO",
      ],
    },
    {
      id: "architecture-capability-isolation",
      status: "implemented",
      topics: ["mcp", "pii", "secrets", "security", "interview"],
      statement:
        "The Architecture MCP can read only this reviewed static manifest and has no database, filesystem, learning-service, storage, or provider dependency.",
      reasoning:
        "Prompt injection cannot invoke capabilities that the server never exposes, and responses are assembled from allowlisted fields.",
      limitation:
        "Human review and safety tests reduce, but cannot eliminate, the risk of sensitive text being added to the manifest later.",
      evidence: [
        "Architecture MCP server",
        "Architecture response builders",
        "Manifest safety tests",
      ],
    },
    {
      id: "private-tunnel-operation",
      status: "operational",
      topics: ["deployment", "system", "security", "interview"],
      statement:
        "The private deployment exposes the Next.js application over HTTPS through a tunnel while database and worker ports remain local.",
      reasoning:
        "The public attack surface is limited to application routes that enforce their own authentication.",
      limitation:
        "Availability depends on the local origin and tunnel processes.",
      evidence: ["MCP production runbook", "External unauthorized smoke check"],
    },
    {
      id: "resource-audience-tokens",
      status: "planned",
      topics: ["mcp", "authentication", "security", "future", "interview"],
      statement:
        "Issue audience-scoped tokens separately for learning and Architecture MCP resources.",
      reasoning:
        "A token obtained for one resource should not authorize another resource after the system grows beyond its single-user boundary.",
      evidence: ["Architecture MCP design"],
    },
    {
      id: "hosted-runtime",
      status: "planned",
      topics: ["deployment", "future", "interview"],
      statement:
        "Move the private local origin to a managed hosted runtime after MCP contracts and workload constraints stabilize.",
      reasoning:
        "Managed hosting would improve availability but adds migration, secret-management, database, worker, and cost tradeoffs.",
      evidence: ["Architecture MCP design", "MCP integration design"],
    },
  ],
  followUpQuestions: [
    "Why did you choose shared domain services instead of having MCP call web API routes?",
    "Which security boundary would change first for a multi-user deployment?",
    "What can prompt injection do if a tool has no filesystem or database capability?",
    "How would you migrate the local deployment without changing the MCP contracts?",
  ],
} satisfies ArchitectureManifest;
