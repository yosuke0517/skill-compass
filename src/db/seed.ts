import { db } from "@/db/client";
import {
  categories,
  conceptSources,
  concepts,
  conceptTags,
  questions,
  scores,
  selfAssessments,
  sources,
  tags,
} from "@/db/schema";

const categoryRows = [
  {
    id: "cat_frontend",
    name: "Frontend",
    description: "Browser, TypeScript, UI architecture, and design systems.",
    displayOrder: 1,
  },
  {
    id: "cat_backend",
    name: "Backend",
    description: "APIs, contracts, application architecture, and reliability.",
    displayOrder: 2,
  },
  {
    id: "cat_infrastructure",
    name: "Infrastructure",
    description: "Networking, deployment, observability, and runtime operations.",
    displayOrder: 3,
  },
  {
    id: "cat_sql",
    name: "SQL",
    description: "Relational modeling, querying, indexing, and performance.",
    displayOrder: 4,
  },
  {
    id: "cat_llm",
    name: "LLM",
    description: "LLM application design, evaluation, retrieval, and agent workflows.",
    displayOrder: 5,
  },
];

const tagRows = [
  {
    id: "tag_frontend_typescript",
    categoryId: "cat_frontend",
    name: "TypeScript",
    description: "Type modeling and practical TypeScript features.",
  },
  {
    id: "tag_frontend_design_system",
    categoryId: "cat_frontend",
    name: "Design System",
    description: "Reusable UI primitives, variants, and tokens.",
  },
  {
    id: "tag_backend_api_design",
    categoryId: "cat_backend",
    name: "API Design",
    description: "Contracts, compatibility, validation, and testing.",
  },
  {
    id: "tag_infrastructure_networking",
    categoryId: "cat_infrastructure",
    name: "Networking",
    description: "DNS, proxies, NAT, and request routing.",
  },
  {
    id: "tag_sql_indexes",
    categoryId: "cat_sql",
    name: "Index Design",
    description: "Indexes, query plans, and performance tradeoffs.",
  },
  {
    id: "tag_llm_workflows",
    categoryId: "cat_llm",
    name: "LLM Workflows",
    description: "Prompting, tools, evaluation, and agentic systems.",
  },
];

const conceptRows = [
  {
    id: "concept_satisfies_operator",
    title: "satisfies operator",
    summary: "Checks that an expression conforms to a type while preserving its specific inferred type.",
    currentUnderstanding: "Use it when object literals should be checked without widening useful literals.",
  },
  {
    id: "concept_design_token",
    title: "design token",
    summary: "A named design decision represented as data and reused across UI surfaces.",
    currentUnderstanding: "Tokens help align implementation values with design system intent.",
  },
  {
    id: "concept_api_contract",
    title: "API contract",
    summary: "The stable agreement between API producers and consumers.",
    currentUnderstanding: "Contracts should be versioned, tested, and explicit about validation behavior.",
  },
  {
    id: "concept_reverse_proxy",
    title: "reverse proxy",
    summary: "A server that receives client requests and forwards them to upstream services.",
    currentUnderstanding: "Reverse proxies often handle TLS, routing, buffering, and load balancing.",
  },
  {
    id: "concept_index_design",
    title: "index design",
    summary: "Choosing database indexes to support query patterns while controlling write cost.",
    currentUnderstanding: "Good indexes match predicates, sort order, cardinality, and workload.",
  },
  {
    id: "concept_mcp",
    title: "MCP",
    summary: "A protocol pattern for connecting model-powered clients with tools and context providers.",
    currentUnderstanding: "MCP is useful for standardizing tool and data access boundaries.",
  },
];

const conceptTagRows = [
  { conceptId: "concept_satisfies_operator", tagId: "tag_frontend_typescript" },
  { conceptId: "concept_design_token", tagId: "tag_frontend_design_system" },
  { conceptId: "concept_api_contract", tagId: "tag_backend_api_design" },
  { conceptId: "concept_api_contract", tagId: "tag_frontend_typescript" },
  { conceptId: "concept_reverse_proxy", tagId: "tag_infrastructure_networking" },
  { conceptId: "concept_index_design", tagId: "tag_sql_indexes" },
  { conceptId: "concept_index_design", tagId: "tag_backend_api_design" },
  { conceptId: "concept_mcp", tagId: "tag_llm_workflows" },
  { conceptId: "concept_mcp", tagId: "tag_frontend_typescript" },
];

const sourceRows = [
  {
    id: "source_typescript_handbook",
    title: "TypeScript Handbook",
    url: "https://www.typescriptlang.org/docs/",
    trustTier: "tier1" as const,
    official: true,
    status: "active" as const,
  },
  {
    id: "source_mdndocs_web",
    title: "MDN Web Docs",
    url: "https://developer.mozilla.org/",
    trustTier: "tier1" as const,
    official: true,
    status: "active" as const,
  },
  {
    id: "source_mysql_docs",
    title: "MySQL Documentation",
    url: "https://dev.mysql.com/doc/",
    trustTier: "tier1" as const,
    official: true,
    status: "active" as const,
  },
  {
    id: "source_model_context_protocol_docs",
    title: "Model Context Protocol Documentation",
    url: "https://modelcontextprotocol.io/",
    trustTier: "tier1" as const,
    official: true,
    status: "active" as const,
  },
];

const conceptSourceRows = [
  { conceptId: "concept_satisfies_operator", sourceId: "source_typescript_handbook" },
  { conceptId: "concept_design_token", sourceId: "source_mdndocs_web" },
  { conceptId: "concept_api_contract", sourceId: "source_mdndocs_web" },
  { conceptId: "concept_reverse_proxy", sourceId: "source_mdndocs_web" },
  { conceptId: "concept_index_design", sourceId: "source_mysql_docs" },
  { conceptId: "concept_mcp", sourceId: "source_model_context_protocol_docs" },
];

const extraPracticeQuestionRows = Array.from({ length: 24 }, (_, index) => {
  const concept = conceptRows[index % conceptRows.length];
  const sourceId =
    concept.id === "concept_index_design"
      ? "source_mysql_docs"
      : concept.id === "concept_mcp"
        ? "source_model_context_protocol_docs"
        : concept.id === "concept_satisfies_operator"
          ? "source_typescript_handbook"
          : "source_mdndocs_web";

  return {
    id: `question_extra_${String(index + 1).padStart(2, "0")}`,
    conceptId: concept.id,
    sourceId,
    difficulty: (index % 3 === 0 ? "beginner" : index % 3 === 1 ? "intermediate" : "advanced") as
      | "beginner"
      | "intermediate"
      | "advanced",
    prompt: `Which practice habit best improves understanding of ${concept.title}?`,
    choices: [
      { id: "a", label: "Compare the concept against a concrete source and explain the tradeoff.", correct: true },
      { id: "b", label: "Memorize the term without checking where it applies.", correct: false },
      { id: "c", label: "Skip examples and only read unrelated summaries.", correct: false },
      { id: "d", label: "Assume the concept has the same meaning in every system.", correct: false },
    ],
    rationale: "Grounding a concept in a trusted source and explaining tradeoffs improves durable understanding.",
  };
});

const questionRows = [
  {
    id: "question_satisfies_literal_preservation",
    conceptId: "concept_satisfies_operator",
    sourceId: "source_typescript_handbook",
    difficulty: "intermediate" as const,
    prompt: "What is the main advantage of TypeScript's satisfies operator over a direct type annotation?",
    choices: [
      { id: "a", label: "It disables excess property checks for object literals.", correct: false },
      {
        id: "b",
        label: "It checks compatibility while preserving the expression's specific inferred type.",
        correct: true,
      },
      { id: "c", label: "It converts runtime values into branded types.", correct: false },
      { id: "d", label: "It forces all properties to become readonly.", correct: false },
    ],
    rationale:
      "The satisfies operator validates assignability without replacing the expression's inferred type.",
  },
  {
    id: "question_design_token_purpose",
    conceptId: "concept_design_token",
    sourceId: "source_mdndocs_web",
    difficulty: "beginner" as const,
    prompt: "In a design system, what is a design token primarily used for?",
    choices: [
      { id: "a", label: "Storing a reusable design decision as named data.", correct: true },
      { id: "b", label: "Rendering every component as a server component.", correct: false },
      { id: "c", label: "Replacing all CSS with inline styles.", correct: false },
      { id: "d", label: "Generating database migrations from UI state.", correct: false },
    ],
    rationale: "A design token gives a design decision a stable name and portable representation.",
  },
  {
    id: "question_api_contract_change",
    conceptId: "concept_api_contract",
    sourceId: "source_mdndocs_web",
    difficulty: "intermediate" as const,
    prompt: "Which API change is most likely to break existing clients?",
    choices: [
      { id: "a", label: "Adding an optional response field.", correct: false },
      { id: "b", label: "Documenting an existing status code.", correct: false },
      { id: "c", label: "Removing a required response field.", correct: true },
      { id: "d", label: "Adding a new endpoint.", correct: false },
    ],
    rationale: "Removing required output violates the contract consumers may already rely on.",
  },
  {
    id: "question_reverse_proxy_role",
    conceptId: "concept_reverse_proxy",
    sourceId: "source_mdndocs_web",
    difficulty: "beginner" as const,
    prompt: "What does a reverse proxy usually do?",
    choices: [
      { id: "a", label: "Forwards client requests to one or more upstream services.", correct: true },
      { id: "b", label: "Assigns private IP addresses to local machines.", correct: false },
      { id: "c", label: "Translates domain names into IP addresses.", correct: false },
      { id: "d", label: "Compiles frontend assets into JavaScript bundles.", correct: false },
    ],
    rationale: "A reverse proxy sits in front of upstream servers and forwards incoming requests.",
  },
  {
    id: "question_index_tradeoff",
    conceptId: "concept_index_design",
    sourceId: "source_mysql_docs",
    difficulty: "intermediate" as const,
    prompt: "What is a common tradeoff when adding a database index?",
    choices: [
      { id: "a", label: "Reads may improve, while writes and storage can become more expensive.", correct: true },
      { id: "b", label: "All queries become faster with no downside.", correct: false },
      { id: "c", label: "Indexes remove the need for schema design.", correct: false },
      { id: "d", label: "Indexes make transactions impossible.", correct: false },
    ],
    rationale: "Indexes can speed up matching reads but require maintenance on writes and consume storage.",
  },
  {
    id: "question_mcp_boundary",
    conceptId: "concept_mcp",
    sourceId: "source_model_context_protocol_docs",
    difficulty: "advanced" as const,
    prompt: "Why is a protocol boundary useful in LLM tool workflows?",
    choices: [
      { id: "a", label: "It guarantees the model will never make mistakes.", correct: false },
      { id: "b", label: "It removes the need for authentication.", correct: false },
      {
        id: "c",
        label: "It standardizes how clients discover and call tools or context providers.",
        correct: true,
      },
      { id: "d", label: "It stores all user data in model weights.", correct: false },
    ],
    rationale: "A protocol boundary makes tool and context access explicit, reusable, and inspectable.",
  },
  {
    id: "question_typescript_narrowing",
    conceptId: "concept_satisfies_operator",
    sourceId: "source_typescript_handbook",
    difficulty: "beginner" as const,
    prompt: "What does TypeScript control-flow narrowing help with?",
    choices: [
      { id: "a", label: "Refining a variable's type after checks such as typeof or equality.", correct: true },
      { id: "b", label: "Changing JavaScript runtime values into database rows.", correct: false },
      { id: "c", label: "Skipping all compile-time type checks.", correct: false },
      { id: "d", label: "Compressing source maps for production builds.", correct: false },
    ],
    rationale: "Control-flow analysis narrows types based on checks and reachable code paths.",
  },
  {
    id: "question_api_backward_compatibility",
    conceptId: "concept_api_contract",
    sourceId: "source_mdndocs_web",
    difficulty: "intermediate" as const,
    prompt: "Which API change is usually backward compatible?",
    choices: [
      { id: "a", label: "Renaming a required request field.", correct: false },
      { id: "b", label: "Removing an enum value clients already send.", correct: false },
      { id: "c", label: "Adding a new optional response field.", correct: true },
      { id: "d", label: "Changing a response number into a string.", correct: false },
    ],
    rationale: "Adding optional output is usually compatible because existing clients can ignore unknown fields.",
  },
  {
    id: "question_reverse_proxy_tls",
    conceptId: "concept_reverse_proxy",
    sourceId: "source_mdndocs_web",
    difficulty: "intermediate" as const,
    prompt: "Why might a reverse proxy terminate TLS?",
    choices: [
      { id: "a", label: "To centralize certificate handling before forwarding traffic upstream.", correct: true },
      { id: "b", label: "To make DNS records unnecessary.", correct: false },
      { id: "c", label: "To disable all authentication checks.", correct: false },
      { id: "d", label: "To convert HTTP requests into SQL queries.", correct: false },
    ],
    rationale: "A reverse proxy can handle TLS at the edge and pass requests to internal services.",
  },
  {
    id: "question_index_selectivity",
    conceptId: "concept_index_design",
    sourceId: "source_mysql_docs",
    difficulty: "advanced" as const,
    prompt: "Why does index selectivity matter?",
    choices: [
      { id: "a", label: "Highly selective indexes can filter rows more effectively.", correct: true },
      { id: "b", label: "Low selectivity always guarantees faster writes and reads.", correct: false },
      { id: "c", label: "Selectivity removes the need for query predicates.", correct: false },
      { id: "d", label: "Selectivity only applies to text columns.", correct: false },
    ],
    rationale: "Indexes are most useful when they reduce the search space for a query.",
  },
  {
    id: "question_design_token_alias",
    conceptId: "concept_design_token",
    sourceId: "source_mdndocs_web",
    difficulty: "intermediate" as const,
    prompt: "Why might a design system use semantic tokens?",
    choices: [
      { id: "a", label: "To name intent such as foreground or danger instead of one raw color.", correct: true },
      { id: "b", label: "To force every component to use a unique color.", correct: false },
      { id: "c", label: "To replace accessibility contrast checks.", correct: false },
      { id: "d", label: "To store production API credentials in CSS.", correct: false },
    ],
    rationale: "Semantic tokens capture usage intent and can map to different raw values per theme.",
  },
  {
    id: "question_mcp_tool_context",
    conceptId: "concept_mcp",
    sourceId: "source_model_context_protocol_docs",
    difficulty: "intermediate" as const,
    prompt: "What should a tool boundary make clear to an LLM client?",
    choices: [
      { id: "a", label: "The inputs, outputs, and permission shape for calling the tool.", correct: true },
      { id: "b", label: "The private billing details of every user.", correct: false },
      { id: "c", label: "A guarantee that all tool calls are correct.", correct: false },
      { id: "d", label: "A way to bypass application authorization.", correct: false },
    ],
    rationale: "Explicit tool boundaries make capabilities and constraints inspectable.",
  },
  ...extraPracticeQuestionRows,
];

async function main() {
  await db.insert(categories).ignore().values(categoryRows);
  await db.insert(tags).ignore().values(tagRows);
  await db.insert(concepts).ignore().values(conceptRows);
  await db.insert(conceptTags).ignore().values(conceptTagRows);
  await db.insert(sources).ignore().values(sourceRows);
  await db.insert(conceptSources).ignore().values(conceptSourceRows);
  await db.insert(questions).ignore().values(questionRows);

  await db
    .insert(scores)
    .ignore()
    .values([
      ...categoryRows.map((category) => ({
        id: `score_${category.id}`,
        subjectType: "category" as const,
        subjectId: category.id,
        value: 0.45,
      })),
      ...tagRows.map((tag) => ({
        id: `score_${tag.id}`,
        subjectType: "tag" as const,
        subjectId: tag.id,
        value: 0.45,
      })),
      ...conceptRows.map((concept) => ({
        id: `score_${concept.id}`,
        subjectType: "concept" as const,
        subjectId: concept.id,
        value: 0.45,
      })),
    ]);

  await db
    .insert(selfAssessments)
    .ignore()
    .values(
      categoryRows.map((category) => ({
        id: `self_${category.id}_initial`,
        subjectType: "category" as const,
        subjectId: category.id,
        rating: 0.5,
        note: "Initial public-safe seed self assessment.",
        assessedOn: new Date("2026-07-08T00:00:00.000Z"),
      })),
    );
}

main()
  .then(() => {
    console.log("Seeded Skill Compass starter data.");
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
