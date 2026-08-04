import type { ArchitectureManifest } from "@/lib/mcp/architecture/types";

export const architectureManifest = {
  version: "2026-07-27",
  productSummary:
    "Skill Compass is an engineering-learning platform built for the LLM era: shared reviewed lesson content develops specialist judgment, while the Web application and capability-limited MCP surfaces deliver practical Today lessons, Podcast briefings, technical X news, and public-safe architecture guidance.",
  topology: [
    "MySQL separates shared reviewed lesson content from user-scoped learning state such as daily assignments, answers, optional answer confidence, reasoning, scores, self-assessments, and history.",
    "Authenticated Web sessions and MCP bearer tokens identify the learner before shared domain services read or change learning state.",
    "A scheduled preparation call places a complete five-question lesson packet into a ChatGPT conversation so Voice/Live can teach from conversation context without calling tools or submitting answers.",
    "Podcast generation and X technical-news collection run through bounded service and worker interfaces, while generated audio is kept in object storage.",
    "After database-backed HTTP authentication, the Architecture MCP answer tools read only reviewed static manifest data and cannot query learning state or user records, filesystem content, storage, or provider APIs.",
  ],
  components: [
    {
      id: "delivery-surfaces",
      name: "Web and ChatGPT delivery",
      responsibility:
        "Present the same Skill Compass learning services through the Web application, learning MCP, scheduled Daily Lesson, and Voice/Live conversation context.",
    },
    {
      id: "learning-services",
      name: "Shared learning services",
      responsibility:
        "Apply practical-question selection, learner-safe projection, answer evaluation, scoring, ownership checks, and Podcast access for authenticated callers.",
    },
    {
      id: "reviewed-lesson-bank",
      name: "Reviewed lesson bank",
      responsibility:
        "Stores shared reviewed lesson content and typed source artifacts without learner answers or profile data.",
    },
    {
      id: "learner-state",
      name: "User-owned learning state",
      responsibility:
        "Stores user-scoped assignments, answers, optional answer confidence, reasoning, progress, scores, self-assessments, and history.",
    },
    {
      id: "podcast-and-news",
      name: "Podcast and X news services",
      responsibility:
        "Collect bounded source context, prepare technical digests, and process queued Podcast generation outside interactive requests.",
    },
    {
      id: "architecture-mcp",
      name: "Architecture MCP",
      responsibility:
        "Answers architecture, security, privacy, and interview questions from reviewed public-safe facts after the HTTP authentication boundary approves the request.",
    },
    {
      id: "object-storage",
      name: "Object storage",
      responsibility:
        "Stores generated Podcast audio without exposing storage credentials through MCP responses.",
    },
  ],
  claims: [
    {
      id: "product-origin-and-pivot",
      status: "implemented",
      topics: ["system", "components", "interview"],
      statement:
        "Skill Compass began as a Web application, and the arrival of ChatGPT Voice/Live shifted its primary role toward canonical learning data and capability-limited delivery while the Web experience remains available.",
      reasoning:
        "Conversational teaching is a strong interaction surface, but reviewed lesson content, learner state, scoring, and source-grounded services still need one durable product boundary.",
      evidence: [
        "Web learning experience",
        "Learning MCP contracts",
        "Scheduled Daily Lesson runbook",
      ],
    },
    {
      id: "shared-reviewed-content",
      status: "implemented",
      topics: ["system", "components", "data_flow", "interview"],
      statement:
        "A shared reviewed lesson content bank contains practical engineering cases and teaching material without learner answers or profile data.",
      reasoning:
        "Reviewing canonical content once keeps the Web, MCP, scheduled lesson, and Voice/Live experience aligned while avoiding copies of the same lesson.",
      evidence: [
        "Reviewed question catalog",
        "Question-bank validator",
        "Idempotent lesson seed",
      ],
    },
    {
      id: "user-scoped-learning-state",
      status: "implemented",
      topics: [
        "system",
        "data_flow",
        "authorization",
        "pii",
        "security",
        "interview",
      ],
      statement:
        "Daily assignments, answers, optional answer confidence, reasoning, scores, self-assessments, and history are user-scoped learning state.",
      reasoning:
        "Learning state belongs to the authenticated learner even though reviewed lesson content is shared. Optional answer confidence is reflection metadata and does not affect Today scoring; the separate self-assessment feature still compares a learner's self-rating with measured scores.",
      limitation:
        "A future repository or schema change could omit an ownership predicate; two-user regression tests and review reduce but do not eliminate that risk.",
      evidence: [
        "User-owned learning schema",
        "User-scoped repositories",
        "Two-user isolation tests",
      ],
    },
    {
      id: "practical-today",
      status: "implemented",
      topics: ["system", "data_flow", "learning", "interview"],
      statement:
        "Today selects five practical mini-cases from a reviewed engineering bank and teaches decisions, trade-offs, failure consequences, and implementation details rather than definition recall alone.",
      reasoning:
        "The product is intended to develop the specialist judgment needed to direct and review LLM-assisted engineering work.",
      evidence: [
        "Practical question model",
        "Balanced daily selector",
        "Today review sequence",
      ],
    },
    {
      id: "shared-domain-boundary",
      status: "implemented",
      topics: ["system", "components", "data_flow", "interview"],
      statement:
        "Web and learning MCP flows call shared Today and Podcast domain services.",
      reasoning:
        "One implementation of authorization, selection, scoring, and Podcast access prevents the delivery surfaces from drifting apart.",
      evidence: [
        "Today service boundary",
        "Podcast service boundary",
        "Learning MCP server",
      ],
    },
    {
      id: "architecture-capability-isolation",
      status: "implemented",
      topics: ["mcp", "pii", "secrets", "security", "interview"],
      statement:
        "The Architecture MCP answer tools read only reviewed static manifest data and cannot query learning state or user records, filesystem content, storage, or provider APIs.",
      reasoning:
        "After HTTP authentication, the answer builders receive the reviewed manifest and assemble responses from allowlisted fields without a learning or user-data repository.",
      limitation:
        "Human review and safety tests reduce, but cannot eliminate, the risk of sensitive text being added to the manifest later.",
      evidence: [
        "Architecture MCP server",
        "Architecture response builders",
        "Manifest safety tests",
      ],
    },
    {
      id: "architecture-http-authentication",
      status: "implemented",
      topics: [
        "mcp",
        "authentication",
        "authorization",
        "pii",
        "security",
        "interview",
      ],
      statement:
        "The Architecture MCP HTTP authentication boundary verifies bearer access through persisted OAuth token and current-user records before the static answer tools run.",
      reasoning:
        "The endpoint rejects unauthenticated callers before creating the MCP server, while the approved tool call receives no learning or user-data repository.",
      limitation:
        "The endpoint is not database-independent: only the post-authentication answer tools are isolated from learning-state and user-record queries.",
      evidence: [
        "Architecture MCP HTTP handler",
        "OAuth bearer authentication service",
        "Current-user access check",
      ],
    },
    {
      id: "scheduled-context-bridge",
      status: "implemented",
      topics: ["mcp", "data_flow", "learning", "interview"],
      statement:
        "A scheduled read prepares all five learner questions and compact instructor data in the ChatGPT conversation before Voice/Live begins.",
      reasoning:
        "Voice/Live can teach from prepared context even when it cannot call an app during the live session, and preparation never submits an answer.",
      limitation:
        "The lesson conversation must be prepared successfully before the live session, and completed answers are synchronized later through normal chat.",
      evidence: [
        "Today instructor pack",
        "Scheduled Daily Lesson contract",
        "Voice/Live sync runbook",
      ],
    },
    {
      id: "mcp-oauth-pkce",
      status: "implemented",
      topics: ["mcp", "authentication", "security", "interview"],
      statement:
        "The MCP connection uses authorization-code OAuth with PKCE S256 and bearer-token authentication.",
      reasoning:
        "ChatGPT does not receive or reuse the browser session cookie, and an intercepted authorization code cannot be redeemed without the verifier.",
      limitation:
        "The current private deployment shares one issuer and does not yet use audience-scoped tokens per MCP resource.",
      evidence: [
        "OAuth metadata",
        "Authorization endpoint",
        "Token endpoint",
        "Bearer authentication service",
      ],
    },
    {
      id: "authenticated-user-boundary",
      status: "implemented",
      topics: [
        "authentication",
        "authorization",
        "mcp",
        "pii",
        "security",
        "interview",
      ],
      statement:
        "Web sessions and MCP bearer tokens determine the authenticated learner; public forms and tool arguments cannot choose another account.",
      reasoning:
        "The identity used by learning services comes from the trusted authentication boundary instead of model-controlled or browser-controlled input.",
      limitation:
        "The current private MCP connector authorizes one configured account even though the learning data model and services isolate state per user.",
      evidence: [
        "Web session boundary",
        "Bearer authentication service",
        "Learning MCP tool schemas",
      ],
    },
    {
      id: "learning-mcp-minimization",
      status: "implemented",
      topics: ["mcp", "pii", "security", "data_flow", "interview"],
      statement:
        "Learning MCP tools return capability-specific domain DTOs instead of database rows or broad application state.",
      reasoning:
        "The client receives only the fields needed for the requested learning interaction; hidden answer data is withheld from the next-question DTO.",
      limitation:
        "The instructor pack intentionally contains teaching answers for the authenticated owner's scheduled lesson, so the conversation must be treated as learner content.",
      evidence: [
        "Learning MCP contracts",
        "Learner-safe Today projection",
        "Instructor-pack projection",
      ],
    },
    {
      id: "database-isolation-tests",
      status: "implemented",
      topics: ["authorization", "pii", "security", "interview"],
      statement:
        "Automated two-user tests verify that one learner cannot read, submit, overwrite, score, or list another learner's learning state.",
      reasoning:
        "Schema ownership alone is insufficient; repository and service behavior must prove the boundary with distinct users.",
      limitation:
        "Tests cover reviewed access paths, but every future query and migration still requires ownership review.",
      evidence: [
        "Today ownership tests",
        "Answer isolation tests",
        "History and score isolation tests",
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
      id: "podcast-pipeline",
      status: "implemented",
      topics: ["system", "components", "data_flow", "podcast", "interview"],
      statement:
        "Podcast generation uses persisted jobs, bounded source snapshots, separate script and speech stages, and object storage for generated audio.",
      reasoning:
        "Separating interactive requests from generation makes long-running work resumable and keeps source, script, and audio failures observable.",
      limitation:
        "Availability still depends on the current worker and origin processes.",
      evidence: [
        "Podcast queue and worker",
        "Podcast source collector",
        "Audio storage boundary",
      ],
    },
    {
      id: "x-technical-news",
      status: "implemented",
      topics: ["system", "data_flow", "x_news", "security", "interview"],
      statement:
        "The daily technical-news flow selects personalized technical trends when available, uses them to guide recent public X search alongside a fixed technical fallback query, then ranks and caches the public-search candidates.",
      reasoning:
        "The personalized signal changes search queries, not the candidate source; every ranked candidate currently comes from public recent search.",
      limitation:
        "X posts are claims rather than verified facts, access depends on provider entitlement, and the digest must preserve links and uncertainty labels.",
      evidence: [
        "X daily digest service",
        "Personalized trend selector",
        "Public-search source-mix tests",
      ],
    },
    {
      id: "private-tunnel-operation",
      status: "operational",
      topics: ["deployment", "system", "security", "interview"],
      statement:
        "The current private deployment exposes the authenticated Next.js application over HTTPS through a tunnel while database and worker interfaces remain private.",
      reasoning:
        "The public attack surface is limited to application routes that enforce their own authentication.",
      limitation:
        "Availability depends on the local origin, worker, and tunnel processes.",
      evidence: [
        "Production operations runbook",
        "External unauthorized smoke check",
      ],
    },
    {
      id: "diagnostic-exam",
      status: "planned",
      topics: ["diagnostic", "future", "learning", "interview"],
      statement:
        "Add a longer practical diagnostic exam that estimates relative proficiency, proposes technical focus areas, and lets the learner adjust recommendations around intended career direction.",
      reasoning:
        "Today supports daily practice; a separately designed diagnostic can establish a broader baseline without making every daily lesson heavy.",
      evidence: ["Practical Today product roadmap"],
    },
    {
      id: "hosted-runtime",
      status: "planned",
      topics: ["deployment", "cloud", "future", "interview"],
      statement:
        "Move the private local origin, relational data, generated assets, and background work to a managed cloud deployment in explicit phases.",
      reasoning:
        "Managed hosting would improve availability but adds migration, secret-management, database, worker, observability, and cost trade-offs.",
      evidence: ["Skill Compass deployment roadmap"],
    },
    {
      id: "resource-audience-tokens",
      status: "planned",
      topics: ["mcp", "authentication", "security", "interview"],
      statement:
        "Issue audience-scoped tokens separately for learning and Architecture MCP resources.",
      reasoning:
        "A token obtained for one capability should not authorize another as the connector boundary grows.",
      evidence: ["Architecture MCP design"],
    },
  ],
  followUpQuestions: [
    "Why did Voice/Live change the role of the Web application without replacing it?",
    "Why is reviewed lesson content shared while learning state is user-scoped?",
    "What can prompt injection do if a tool has no filesystem or database capability?",
    "How do the two-user tests support the authorization argument?",
    "How would you phase the cloud migration without changing the MCP contracts?",
  ],
} satisfies ArchitectureManifest;
