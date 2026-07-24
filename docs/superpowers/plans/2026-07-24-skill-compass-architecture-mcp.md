# Skill Compass Architecture MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a private, read-only Architecture MCP that answers technical-interview questions from a reviewed public-safe manifest without access to source files, runtime secrets, the database, or user data.

**Architecture:** A dedicated `/mcp/architecture` resource reuses the existing OAuth bearer validation but creates an Architecture-only MCP server with three read-only tools. Those tools call pure selectors over a checked-in, validated manifest; the route has no Today, Podcast, database, storage, provider, filesystem, or arbitrary retrieval dependency.

**Tech Stack:** Next.js 16 App Router, TypeScript 6, MCP TypeScript SDK 1.29, Zod 4, Vitest 4, existing OAuth 2.1-style Authorization Code + PKCE S256 flow.

## Global Constraints

- The manifest is the only technical knowledge source available to Architecture MCP tools.
- Current claims use only `implemented` or `operational`; future improvements use only `planned`.
- The endpoint must not read source files, `.env`, process environment values beyond endpoint/auth configuration, Keychain, logs, database rows, storage, or user content at request time.
- Tool schemas must not accept file paths, URLs, SQL, shell commands, user IDs, or arbitrary retrieval targets.
- All three tools use `readOnlyHint: true` and `destructiveHint: false`.
- Responses use explicit allowlisted fields and never serialize arbitrary runtime objects.
- English is the default; Japanese is selected from the latest substantive user message.
- The scheduled 07:00 learning run must not invoke Architecture tools automatically.
- No new production dependency or database migration is allowed.

## File Structure

- Create `src/lib/mcp/architecture/types.ts`: manifest, claim, topic, depth, and response contracts.
- Create `src/lib/mcp/architecture/manifest.ts`: reviewed public-safe Skill Compass facts.
- Create `src/lib/mcp/architecture/manifest-validator.ts`: disclosure-pattern and schema validation.
- Create `src/lib/mcp/architecture/answers.ts`: pure allowlisted overview, security, and interview response builders.
- Create `src/lib/mcp/architecture/server.ts`: the three Architecture MCP tool registrations.
- Create `src/lib/mcp/architecture/http-handler.ts`: authenticated streamable HTTP transport with no learning-service dependency.
- Create `src/app/mcp/architecture/route.ts`: Architecture MCP POST route.
- Create `src/app/.well-known/oauth-protected-resource/mcp/architecture/route.ts`: protected-resource metadata.
- Create `tests/unit/mcp-architecture-manifest.test.ts`: schema and sensitive-pattern guardrails.
- Create `tests/unit/mcp-architecture-answers.test.ts`: deterministic response selection and status separation.
- Create `tests/unit/mcp-architecture-tools.test.ts`: exact tool contract and read-only annotations.
- Create `tests/integration/mcp-architecture-route.test.ts`: authentication, host, initialization, and dependency isolation.
- Modify `src/lib/env.ts`: add `MCP_ARCHITECTURE_RESOURCE_URL`.
- Modify `.env.example`: document the second resource URL without adding credentials.
- Modify `docs/runbooks/chatgpt-mcp.md`: deployment, smoke verification, ChatGPT connection, and scheduled-task routing.

---

### Task 1: Public-Safe Architecture Manifest

**Files:**
- Create: `src/lib/mcp/architecture/types.ts`
- Create: `src/lib/mcp/architecture/manifest.ts`
- Create: `src/lib/mcp/architecture/manifest-validator.ts`
- Create: `tests/unit/mcp-architecture-manifest.test.ts`

**Interfaces:**
- Produces: `architectureManifest: ArchitectureManifest`
- Produces: `validateArchitectureManifest(manifest: ArchitectureManifest): void`
- Produces: `ClaimStatus`, `ArchitectureTopic`, `SecurityTopic`, `InterviewDepth`, `ArchitectureClaim`, and `ArchitectureManifest`

- [ ] **Step 1: Write the failing manifest safety test**

```ts
import { describe, expect, it } from "vitest";

import { architectureManifest } from "@/lib/mcp/architecture/manifest";
import { validateArchitectureManifest } from "@/lib/mcp/architecture/manifest-validator";
import type { ArchitectureManifest } from "@/lib/mcp/architecture/types";

describe("Architecture MCP public-safe manifest", () => {
  it("accepts the reviewed Skill Compass manifest", () => {
    expect(() => validateArchitectureManifest(architectureManifest)).not.toThrow();
  });

  it.each([
    "owner@example.com",
    "/Users/example/project/.env",
    "C:\\Users\\example\\secret.txt",
    "https://private.example.net/mcp",
    "Authorization: Bearer abc123",
    "PRIVATE_KEY=secret",
  ])("rejects disclosure-shaped content: %s", (unsafeText) => {
    const manifest: ArchitectureManifest = {
      ...architectureManifest,
      productSummary: unsafeText,
    };
    expect(() => validateArchitectureManifest(manifest)).toThrow(
      "unsafe_architecture_manifest",
    );
  });

  it("rejects an unsupported claim status at runtime", () => {
    const manifest = structuredClone(architectureManifest) as unknown as {
      claims: Array<Record<string, unknown>>;
    };
    manifest.claims[0].status = "maybe";
    expect(() =>
      validateArchitectureManifest(manifest as unknown as ArchitectureManifest),
    ).toThrow("invalid_architecture_manifest");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
ASDF_NODEJS_VERSION=22.15.0 ASDF_PNPM_VERSION=10.32.1 pnpm vitest run tests/unit/mcp-architecture-manifest.test.ts
```

Expected: FAIL because the Architecture manifest modules do not exist.

- [ ] **Step 3: Add the manifest contracts**

Create `src/lib/mcp/architecture/types.ts`:

```ts
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
```

- [ ] **Step 4: Add the reviewed manifest**

Create `src/lib/mcp/architecture/manifest.ts` with an `ArchitectureManifest` containing:

```ts
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
      responsibility: "Serves the web UI, OAuth endpoints, MCP resources, and application APIs.",
    },
    {
      id: "learning-services",
      name: "Shared learning services",
      responsibility: "Centralize authorization, validation, scoring, Podcast access, and persistence for web and MCP callers.",
    },
    {
      id: "relational-store",
      name: "MySQL",
      responsibility: "Stores users, learning state, Podcast metadata, conversations, and OAuth records.",
    },
    {
      id: "object-storage",
      name: "Object storage",
      responsibility: "Stores generated Podcast audio without exposing storage credentials through MCP.",
    },
    {
      id: "background-worker",
      name: "Podcast worker",
      responsibility: "Processes queued generation separately from interactive HTTP requests.",
    },
  ],
  claims: [
    {
      id: "shared-domain-boundary",
      status: "implemented",
      topics: ["system", "components", "data_flow", "interview"],
      statement: "Web and learning MCP flows call shared Today and Podcast services.",
      reasoning: "This prevents a second scoring or Podcast-answering implementation from drifting from web behavior.",
      evidence: ["Today service boundary", "Podcast service boundary", "Learning MCP server"],
    },
    {
      id: "mcp-oauth-pkce",
      status: "implemented",
      topics: ["mcp", "authentication", "security", "interview"],
      statement: "The MCP connection uses authorization-code OAuth with PKCE S256 and bearer-token authentication.",
      reasoning: "ChatGPT does not receive or reuse the browser session cookie, and intercepted authorization codes cannot be redeemed without the verifier.",
      limitation: "The initial private deployment shares one issuer and does not yet use audience-scoped tokens per MCP resource.",
      evidence: ["OAuth metadata", "Authorization endpoint", "Token endpoint", "Bearer authentication service"],
    },
    {
      id: "single-user-authorization",
      status: "implemented",
      topics: ["authorization", "mcp", "pii", "security", "interview"],
      statement: "Bearer authentication is bound to one configured active Skill Compass user, and learning tools do not accept an arbitrary user ID.",
      reasoning: "A caller cannot select another account through tool arguments, and domain services enforce resource ownership.",
      limitation: "This is suitable for the current private deployment but would need tenant-aware policy for a multi-user product.",
      evidence: ["Bearer authentication service", "Learning MCP tool schemas", "Domain ownership checks"],
    },
    {
      id: "secret-storage",
      status: "implemented",
      topics: ["secrets", "security", "interview"],
      statement: "Provider secrets are loaded from deployment configuration or the operating-system credential store, and provider OAuth tokens are encrypted before database persistence.",
      reasoning: "Secret values stay outside MCP responses and are not stored as plain application content.",
      limitation: "Host compromise or an unsafe future code path could still expose process-accessible secrets.",
      evidence: ["Environment schema", "Credential-store integration", "OAuth token encryption"],
    },
    {
      id: "learning-mcp-minimization",
      status: "implemented",
      topics: ["mcp", "pii", "security", "data_flow", "interview"],
      statement: "Learning MCP tools return bounded domain DTOs and omit correctness metadata for unanswered quizzes, storage credentials, and audio internals.",
      reasoning: "The client receives only the fields required for the requested learning interaction.",
      limitation: "Podcast transcripts and quiz reasoning are personal content intentionally returned when the authenticated owner requests them.",
      evidence: ["Learning MCP contracts", "Today service DTO", "Podcast service DTO"],
    },
    {
      id: "architecture-capability-isolation",
      status: "implemented",
      topics: ["mcp", "pii", "secrets", "security", "interview"],
      statement: "The Architecture MCP can read only this reviewed static manifest and has no database, filesystem, learning-service, storage, or provider dependency.",
      reasoning: "Prompt injection cannot invoke capabilities that the server never exposes, and responses are assembled from allowlisted fields.",
      limitation: "Human review and safety tests reduce, but cannot eliminate, the risk of sensitive text being added to the manifest later.",
      evidence: ["Architecture MCP server", "Architecture response builders", "Manifest safety tests"],
    },
    {
      id: "private-tunnel-operation",
      status: "operational",
      topics: ["deployment", "system", "security", "interview"],
      statement: "The private deployment exposes the Next.js application over HTTPS through a tunnel while database and worker ports remain local.",
      reasoning: "The public attack surface is limited to application routes that enforce their own authentication.",
      limitation: "Availability depends on the local origin and tunnel processes.",
      evidence: ["MCP production runbook", "External unauthorized smoke check"],
    },
    {
      id: "resource-audience-tokens",
      status: "planned",
      topics: ["mcp", "authentication", "security", "future", "interview"],
      statement: "Issue audience-scoped tokens separately for learning and Architecture MCP resources.",
      reasoning: "A token obtained for one resource should not authorize another resource after the system grows beyond its single-user boundary.",
      evidence: ["Architecture MCP design"],
    },
    {
      id: "hosted-runtime",
      status: "planned",
      topics: ["deployment", "future", "interview"],
      statement: "Move the private local origin to a managed hosted runtime after MCP contracts and workload constraints stabilize.",
      reasoning: "Managed hosting would improve availability but adds migration, secret-management, database, worker, and cost tradeoffs.",
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
```

- [ ] **Step 5: Add runtime validation and disclosure guards**

Create `src/lib/mcp/architecture/manifest-validator.ts`:

```ts
import { z } from "zod";

import { claimStatuses, type ArchitectureManifest } from "@/lib/mcp/architecture/types";

const manifestSchema = z.object({
  version: z.string().min(1),
  productSummary: z.string().min(1),
  topology: z.array(z.string().min(1)).min(1),
  components: z.array(
    z.object({
      id: z.string().regex(/^[a-z0-9-]+$/),
      name: z.string().min(1),
      responsibility: z.string().min(1),
    }),
  ),
  claims: z.array(
    z.object({
      id: z.string().regex(/^[a-z0-9-]+$/),
      status: z.enum(claimStatuses),
      topics: z.array(z.string().min(1)).min(1),
      statement: z.string().min(1),
      reasoning: z.string().min(1),
      limitation: z.string().min(1).optional(),
      evidence: z.array(z.string().min(1)).min(1),
    }),
  ),
  followUpQuestions: z.array(z.string().min(1)),
});

const unsafePatterns = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /(^|[\s"'`])\/(?:Users|home|var|etc|opt|private)\//,
  /\b[A-Z]:\\Users\\/i,
  /https?:\/\/(?!(?:example\.com|localhost)(?:[/:]|$))[^\s"'`]+/i,
  /\bAuthorization\s*:\s*Bearer\b/i,
  /\b(?:PRIVATE_KEY|SECRET|TOKEN|PASSWORD)\s*=/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

export function validateArchitectureManifest(manifest: ArchitectureManifest): void {
  const parsed = manifestSchema.safeParse(manifest);
  if (!parsed.success) {
    throw new Error("invalid_architecture_manifest");
  }
  const serialized = JSON.stringify(parsed.data);
  if (unsafePatterns.some((pattern) => pattern.test(serialized))) {
    throw new Error("unsafe_architecture_manifest");
  }
}
```

- [ ] **Step 6: Run the manifest test**

Run:

```bash
ASDF_NODEJS_VERSION=22.15.0 ASDF_PNPM_VERSION=10.32.1 pnpm vitest run tests/unit/mcp-architecture-manifest.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/mcp/architecture/types.ts src/lib/mcp/architecture/manifest.ts src/lib/mcp/architecture/manifest-validator.ts tests/unit/mcp-architecture-manifest.test.ts
git commit -m "feat: add public-safe architecture manifest"
```

---

### Task 2: Allowlisted Architecture Answer Builders

**Files:**
- Create: `src/lib/mcp/architecture/answers.ts`
- Create: `tests/unit/mcp-architecture-answers.test.ts`

**Interfaces:**
- Consumes: `ArchitectureManifest`, `ArchitectureTopic`, `SecurityTopic`, and `InterviewDepth`
- Produces: `getArchitectureOverview(input)`, `explainSecurityAndPrivacy(input)`, and `answerTechnicalInterviewQuestion(input)`

- [ ] **Step 1: Write failing response-contract tests**

The test must assert:

```ts
const overview = getArchitectureOverview({
  manifest: architectureManifest,
  focus: "system",
  latestUserMessage: "構成を説明して",
});
expect(overview.responseLanguage).toBe("ja");
expect(Object.keys(overview).sort()).toEqual([
  "components",
  "currentArchitecture",
  "currentTradeoffs",
  "focus",
  "productSummary",
  "responseLanguage",
]);

const security = explainSecurityAndPrivacy({
  manifest: architectureManifest,
  topic: "mcp",
  latestUserMessage: "Can MCP read my secrets?",
});
expect(security.responseLanguage).toBe("en");
expect(security.controls.every((claim) => claim.status !== "planned")).toBe(true);
expect(security.plannedImprovements.every((claim) => claim.status === "planned")).toBe(true);
expect(security.residualRisks).toContain(
  "Human review and safety tests reduce, but cannot eliminate, the risk of sensitive text being added to the manifest later.",
);

const answer = answerTechnicalInterviewQuestion({
  manifest: architectureManifest,
  question: "How did you secure the MCP and protect PII?",
  depth: "standard",
  latestUserMessage: "How did you secure it?",
});
expect(answer.currentFacts.length).toBeGreaterThan(0);
expect(answer.currentFacts.every((claim) => claim.status !== "planned")).toBe(true);
expect(answer.plannedImprovements.every((claim) => claim.status === "planned")).toBe(true);
expect(JSON.stringify(answer)).not.toContain("productSummary");
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
ASDF_NODEJS_VERSION=22.15.0 ASDF_PNPM_VERSION=10.32.1 pnpm vitest run tests/unit/mcp-architecture-answers.test.ts
```

Expected: FAIL because `answers.ts` does not exist.

- [ ] **Step 3: Implement pure topic selection and allowlisted DTOs**

In `answers.ts`:

- Validate the manifest once at each public entrypoint.
- Convert claims with a `publicClaim` helper that returns only `id`, `status`, `statement`, `reasoning`, `limitation`, and `evidence`.
- Match interview questions against fixed English and Japanese keyword maps for architecture, MCP, auth, secrets, PII, deployment, Today, and Podcast.
- Fall back to claims tagged `interview` when no keyword matches.
- Limit `brief` to 2 current facts and 1 planned improvement, `standard` to 5 and 2, and `deep_dive` to all matched claims.
- Build `directAnswer` from the selected current statements without calling an LLM or reading another source.
- Return `followUpPoints` from the manifest, limited to 2, 3, or 4 according to depth.
- Use `detectResponseLanguage(latestUserMessage)` for `responseLanguage`.

The exported signatures must be:

```ts
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
};

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
};

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
};
```

- [ ] **Step 4: Run answer tests**

Run:

```bash
ASDF_NODEJS_VERSION=22.15.0 ASDF_PNPM_VERSION=10.32.1 pnpm vitest run tests/unit/mcp-architecture-answers.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mcp/architecture/answers.ts tests/unit/mcp-architecture-answers.test.ts
git commit -m "feat: add architecture interview answers"
```

---

### Task 3: Read-Only Architecture MCP Tools

**Files:**
- Create: `src/lib/mcp/architecture/server.ts`
- Create: `tests/unit/mcp-architecture-tools.test.ts`

**Interfaces:**
- Consumes: the three answer builders and `architectureManifest`
- Produces: `createArchitectureMcpServer()`

- [ ] **Step 1: Write the failing MCP contract test**

Use an in-memory MCP client and assert:

```ts
const result = await client.listTools();
expect(result.tools.map((tool) => tool.name).sort()).toEqual([
  "answer_technical_interview_question",
  "explain_security_and_privacy",
  "get_architecture_overview",
]);
expect(result.tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);
expect(result.tools.every((tool) => tool.annotations?.destructiveHint === false)).toBe(true);

const serialized = JSON.stringify(result.tools);
for (const forbidden of ["userId", "filePath", "url", "sql", "command"]) {
  expect(serialized).not.toContain(forbidden);
}
```

Call each tool once, verify structured content, and verify invalid `topic` and `depth` values return MCP input-validation errors.

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
ASDF_NODEJS_VERSION=22.15.0 ASDF_PNPM_VERSION=10.32.1 pnpm vitest run tests/unit/mcp-architecture-tools.test.ts
```

Expected: FAIL because the Architecture MCP server does not exist.

- [ ] **Step 3: Register exactly three read-only tools**

Implement `createArchitectureMcpServer()` with server identity:

```ts
new McpServer(
  { name: "skill-compass-architecture", version: "1.0.0" },
  { capabilities: { tools: {} } },
);
```

Register:

```ts
get_architecture_overview: {
  focus: z.enum(architectureTopics).default("system"),
  latestUserMessage: z.string().max(4000).optional(),
}

explain_security_and_privacy: {
  topic: z.enum(securityTopics),
  latestUserMessage: z.string().max(4000).optional(),
}

answer_technical_interview_question: {
  question: z.string().trim().min(1).max(2000),
  depth: z.enum(interviewDepths).default("standard"),
  latestUserMessage: z.string().max(4000).optional(),
}
```

Each callback passes only the parsed enum/string values and the imported static manifest to the relevant pure answer builder, then returns:

```ts
{
  content: [{ type: "text" as const, text: JSON.stringify(value) }],
  structuredContent: value,
}
```

Do not accept dependencies, a user object, a repository, or a generic retrieval callback in this server factory.

- [ ] **Step 4: Run MCP tool tests**

Run:

```bash
ASDF_NODEJS_VERSION=22.15.0 ASDF_PNPM_VERSION=10.32.1 pnpm vitest run tests/unit/mcp-architecture-tools.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mcp/architecture/server.ts tests/unit/mcp-architecture-tools.test.ts
git commit -m "feat: expose architecture MCP tools"
```

---

### Task 4: Authenticated Architecture MCP Resource

**Files:**
- Create: `src/lib/mcp/architecture/http-handler.ts`
- Create: `src/app/mcp/architecture/route.ts`
- Create: `src/app/.well-known/oauth-protected-resource/mcp/architecture/route.ts`
- Create: `tests/integration/mcp-architecture-route.test.ts`
- Modify: `src/lib/env.ts`
- Modify: `.env.example`
- Modify: `tests/unit/env.test.ts`
- Modify: `tests/unit/mcp-oauth-http.test.ts`

**Interfaces:**
- Consumes: `createArchitectureMcpServer`, `authenticateMcpBearer`, existing OAuth repository, and current-user lookup
- Produces: `handleArchitectureMcpRequest(request, deps)` and `handleProductionArchitectureMcpRequest(request)`
- Produces: configured `MCP_ARCHITECTURE_RESOURCE_URL`

- [ ] **Step 1: Write failing environment and HTTP tests**

Add an env assertion:

```ts
const env = parseEnv({
  ...requiredEnv,
  MCP_ARCHITECTURE_RESOURCE_URL: "https://example.com/mcp/architecture",
});
expect(env.MCP_ARCHITECTURE_RESOURCE_URL).toBe(
  "https://example.com/mcp/architecture",
);
```

In the integration test, assert:

- Missing bearer returns `401`.
- `www-authenticate` contains `/.well-known/oauth-protected-resource/mcp/architecture`.
- A forwarded request from the configured public origin is accepted.
- A mismatched host returns `403` before authentication.
- Valid authentication initializes server name `skill-compass-architecture`.
- The handler dependency type contains only `resourceUrl` and `authenticate`; there is no `createServices`.

- [ ] **Step 2: Run focused tests to verify they fail**

Run:

```bash
ASDF_NODEJS_VERSION=22.15.0 ASDF_PNPM_VERSION=10.32.1 pnpm vitest run tests/unit/env.test.ts tests/integration/mcp-architecture-route.test.ts tests/unit/mcp-oauth-http.test.ts
```

Expected: FAIL because the environment field and Architecture HTTP modules do not exist.

- [ ] **Step 3: Add the environment field**

Add to `src/lib/env.ts` next to `MCP_RESOURCE_URL`:

```ts
MCP_ARCHITECTURE_RESOURCE_URL: z.string().url().optional(),
```

Add to `.env.example`:

```dotenv
MCP_ARCHITECTURE_RESOURCE_URL=https://agent.example.com/mcp/architecture
```

Do not add a token, client secret, user ID, or real production hostname.

- [ ] **Step 4: Implement the dependency-minimal HTTP handler**

`McpArchitectureHttpDeps` must be:

```ts
type McpArchitectureHttpDeps = {
  resourceUrl: string;
  authenticate(authorization: string | null): Promise<boolean>;
};
```

Implement the same forwarded-host validation and stateless `WebStandardStreamableHTTPServerTransport` lifecycle as the learning handler. On missing authentication, advertise:

```ts
new URL(
  "/.well-known/oauth-protected-resource/mcp/architecture",
  deps.resourceUrl,
)
```

After authentication, create only `createArchitectureMcpServer()`. The production wrapper may dynamically import current-user lookup, the MCP auth repository, and bearer authentication, but it must return a boolean and must not pass the user into the Architecture server:

```ts
const userId = await authenticateMcpBearer(
  authorization,
  createDrizzleMcpAuthRepository(),
  { allowedUserId },
);
return userId ? Boolean(await getCurrentUserById(userId)) : false;
```

- [ ] **Step 5: Add App Router routes and metadata**

`src/app/mcp/architecture/route.ts`:

```ts
import { handleProductionArchitectureMcpRequest } from "@/lib/mcp/architecture/http-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = handleProductionArchitectureMcpRequest;
```

The protected-resource metadata route returns `503` unless issuer and Architecture resource URL are set, otherwise:

```ts
protectedResourceMetadata(
  env.MCP_ISSUER_URL,
  env.MCP_ARCHITECTURE_RESOURCE_URL,
)
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
ASDF_NODEJS_VERSION=22.15.0 ASDF_PNPM_VERSION=10.32.1 pnpm vitest run tests/unit/env.test.ts tests/integration/mcp-architecture-route.test.ts tests/unit/mcp-oauth-http.test.ts
```

Expected: PASS.

- [ ] **Step 7: Verify import isolation**

Run:

```bash
rg -n "db|quiz|podcast|storage|gemini|keychain|node:fs|process\\.env" src/lib/mcp/architecture src/app/mcp/architecture
```

Expected: no matches except the explicit documentation words inside manifest claims; `http-handler.ts`, `server.ts`, and `answers.ts` must have no forbidden import.

- [ ] **Step 8: Commit**

```bash
git add src/lib/env.ts .env.example src/lib/mcp/architecture/http-handler.ts src/app/mcp/architecture/route.ts src/app/.well-known/oauth-protected-resource/mcp/architecture/route.ts tests/unit/env.test.ts tests/unit/mcp-oauth-http.test.ts tests/integration/mcp-architecture-route.test.ts
git commit -m "feat: add authenticated architecture MCP route"
```

---

### Task 5: Runbook, Full Verification, and Production Connection

**Files:**
- Modify: `docs/runbooks/chatgpt-mcp.md`

**Interfaces:**
- Consumes: deployed Architecture resource URL and existing OAuth issuer
- Produces: reproducible deployment, ChatGPT connection, interview smoke checks, and scheduled-task routing

- [ ] **Step 1: Add runbook configuration and safety notes**

Document:

```dotenv
MCP_ARCHITECTURE_RESOURCE_URL=https://agent.finegate.xyz/mcp/architecture
```

Add commands to verify:

```bash
curl -i https://agent.finegate.xyz/.well-known/oauth-protected-resource/mcp/architecture
curl -i -X POST https://agent.finegate.xyz/mcp/architecture \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
```

Expected results:

- Metadata returns `200` with the Architecture resource.
- Unauthenticated initialize returns `401`.
- No response contains a credential, email address, absolute path, or user content.

Document that manifest edits require human review plus the disclosure tests and that “cannot leak” must be phrased as a capability boundary with residual risks.

- [ ] **Step 2: Run complete automated verification**

Run:

```bash
ASDF_NODEJS_VERSION=22.15.0 ASDF_PNPM_VERSION=10.32.1 pnpm typecheck
ASDF_NODEJS_VERSION=22.15.0 ASDF_PNPM_VERSION=10.32.1 pnpm lint
ASDF_NODEJS_VERSION=22.15.0 ASDF_PNPM_VERSION=10.32.1 pnpm test
ASDF_NODEJS_VERSION=22.15.0 ASDF_PNPM_VERSION=10.32.1 pnpm build
```

Expected: all commands exit 0.

- [ ] **Step 3: Commit runbook and verification documentation**

```bash
git add docs/runbooks/chatgpt-mcp.md
git commit -m "docs: add architecture MCP runbook"
```

- [ ] **Step 4: Configure and restart the local production process**

Set `MCP_ARCHITECTURE_RESOURCE_URL` in the existing private production environment to the same public host with `/mcp/architecture`, rebuild, and restart the supervised Next.js production process. Do not print environment contents or secret values.

Expected:

- The supervised process stays running.
- The existing learning MCP remains reachable.
- The Architecture metadata route returns the configured Architecture resource.
- Unauthenticated Architecture MCP requests return `401`.

- [ ] **Step 5: Connect the Architecture app in ChatGPT**

In the already logged-in `陽祐（dev）` Chrome profile:

1. Create a custom app named `Skill Compass Architecture`.
2. Set its MCP URL to the Architecture resource URL.
3. Complete the existing Skill Compass OAuth login and authorization.
4. Confirm ChatGPT discovers exactly the three Architecture tools.

Do not paste local environment credentials into the MCP configuration. OAuth login uses the Skill Compass account; the custom app stores the resulting connection, not the local database password.

- [ ] **Step 6: Perform conversational safety and interview smoke checks**

Ask:

```text
Give me a brief overview of how Skill Compass is built.
```

Expected: English overview, current topology, and no production hostname or personal identifier.

Ask:

```text
このMCPから秘匿情報や個人情報が抜かれにくいのはなぜ？限界も含めて説明して。
```

Expected: Japanese answer explaining static-manifest capability isolation, schema/response allowlisting, authentication, no database/filesystem dependency, and residual manifest/future-tool risk.

Ask:

```text
技術面接で「Skill CompassのMCP認証をどう設計したか」に2分で答えたい。
```

Expected: current OAuth/PKCE and authorization facts separated from audience-scoped-token improvements labeled as planned.

- [ ] **Step 7: Update and manually verify the scheduled-task instructions**

Append:

```text
When the user asks how Skill Compass was built, or asks about its architecture,
security, privacy, technical tradeoffs, or MCP data boundaries, use the Skill
Compass Architecture app. Separate current implementation facts from planned
improvements. Do not call Architecture tools during the automatic 07:00 Today
and Podcast preparation.
```

Manually run the task once and verify:

- The automatic run still calls only `get_today` and `list_podcast_episodes`.
- A follow-up architecture question in the same task conversation can call the Architecture app.
- Japanese follow-ups receive Japanese answers.

- [ ] **Step 8: Record final verification**

Run:

```bash
git status --short --branch
git log --oneline -8
```

Expected: the worktree is clean and local `main` contains the Architecture MCP commits. Do not push unless the user explicitly asks.
