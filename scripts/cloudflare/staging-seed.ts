import { execFile } from "node:child_process";
import { chmod, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

import { buildConceptSeedRows, learningSourceRows } from "../../src/db/learning-seed-data";
import { createQuestionSeedPlan } from "../../src/db/seed-question-bank";
import { hashPassword } from "../../src/lib/auth/password";
import { learningCatalog } from "../../src/lib/quiz/content/catalog";
import { reviewedQuestionBank } from "../../src/lib/quiz/content/question-bank";
import { validateQuestionBank } from "../../src/lib/quiz/content/validate-question-bank";

type SeedInput = {
  userId: string;
  email: string;
  passwordHash: string;
  now?: Date;
};

type SqlValue = string | number | boolean | null | undefined | object;

const execFileAsync = promisify(execFile);

const entitlementRows = [
  ["podcast.sample.view", "Podcast sampleを表示する"],
  ["podcast.generate", "個人Podcastを生成する"],
  ["podcast.download", "Podcast音声をdownloadする"],
  ["podcast.chat", "Podcast内容について質問する"],
  ["calendar.connect", "Google Calendarを接続する"],
  ["x.personal_sources", "個人X Sourceを利用する"],
  ["podcast.english.generate", "英語版Podcastを生成する"],
  ["x.publish", "承認済みPodcastをXへ投稿する"],
  ["integration.manage", "外部連携設定を管理する"],
  ["access.manage", "role、plan、entitlementを管理する"],
] as const;

const proEntitlementIds = entitlementRows.map(([id]) => id);

function sqlValue(value: SqlValue): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("non_finite_sql_number");
    return String(value);
  }
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return `'${text.replaceAll("'", "''")}'`;
}

function insert(table: string, row: Record<string, SqlValue>, mode = "OR IGNORE") {
  const entries = Object.entries(row);
  const columns = entries.map(([column]) => `\`${column}\``).join(", ");
  const values = entries.map(([, value]) => sqlValue(value)).join(", ");
  return `INSERT ${mode} INTO \`${table}\` (${columns}) VALUES (${values});`;
}

function upsert(table: string, row: Record<string, SqlValue>, primaryKey: string[] = ["id"]) {
  const entries = Object.entries(row);
  const columns = entries.map(([column]) => `\`${column}\``).join(", ");
  const values = entries.map(([, value]) => sqlValue(value)).join(", ");
  const mutable = entries.map(([column]) => column).filter((column) => !primaryKey.includes(column));
  const action = mutable.length > 0
    ? `DO UPDATE SET ${mutable.map((column) => `\`${column}\` = excluded.\`${column}\``).join(", ")}`
    : "DO NOTHING";
  return `INSERT INTO \`${table}\` (${columns}) VALUES (${values}) ON CONFLICT (${primaryKey.map((column) => `\`${column}\``).join(", ")}) ${action};`;
}

export function buildStagingSeedSql(input: SeedInput): string {
  if (!input.userId.startsWith("user_staging")) throw new Error("staging_user_id_required");
  if (!input.email.endsWith("@skill-compass.invalid")) throw new Error("staging_email_required");
  if (!input.passwordHash.startsWith("scrypt$")) throw new Error("scrypt_password_hash_required");

  validateQuestionBank(reviewedQuestionBank);
  const now = Math.floor((input.now ?? new Date()).getTime() / 1_000);
  const categories = learningCatalog.map((category, index) => ({
    id: category.id,
    name: category.name,
    description: `Practical ${category.name} decisions and production scenarios.`,
    display_order: index + 1,
    created_at: now,
  }));
  const tags = learningCatalog.flatMap((category) =>
    category.subtopics.map((subtopic) => ({
      id: `tag_${category.id}_${subtopic.id}`,
      category_id: category.id,
      name: subtopic.name,
      description: `${category.name}: ${subtopic.name} practical coverage.`,
      created_at: now,
    })),
  );
  const concepts = buildConceptSeedRows(reviewedQuestionBank);
  const questions = createQuestionSeedPlan(reviewedQuestionBank).rows;

  const statements = [
    "PRAGMA foreign_keys = ON;",
    upsert("users", {
      id: input.userId,
      email: input.email,
      display_name: "Staging User",
      password_hash: input.passwordHash,
      status: "active",
      role: "admin",
      plan: "pro",
      created_at: now,
      updated_at: now,
    }),
    ...entitlementRows.map(([id, description]) =>
      upsert("entitlements", { id, description, created_at: now }),
    ),
    ...proEntitlementIds.map((entitlementId) =>
      upsert("plan_entitlements", { plan_id: "pro", entitlement_id: entitlementId, enabled: true }, ["plan_id", "entitlement_id"]),
    ),
    ...categories.map((row) => upsert("categories", row)),
    ...tags.map((row) => upsert("tags", row)),
    ...concepts.map((row) =>
      upsert("concepts", {
        id: row.id,
        title: row.title,
        summary: row.summary,
        current_understanding: row.currentUnderstanding,
        created_at: now,
        updated_at: now,
      }),
    ),
    ...learningSourceRows.map((row) =>
      upsert("sources", {
        id: row.id,
        title: row.title,
        url: row.url,
        trust_tier: row.trustTier,
        official: row.official,
        status: row.status,
        created_at: now,
      }),
    ),
    ...reviewedQuestionBank.map((question) =>
      insert("concept_tags", {
        concept_id: question.conceptId,
        tag_id: `tag_${question.categoryId}_${question.subtopicId}`,
      }, "OR IGNORE"),
    ),
    ...reviewedQuestionBank.map((question) =>
      insert("concept_sources", {
        concept_id: question.conceptId,
        source_id: question.sourceId,
      }, "OR IGNORE"),
    ),
    ...questions.map((row) =>
      upsert("questions", {
        id: row.id,
        concept_id: row.conceptId,
        source_id: row.sourceId,
        scenario: row.scenario,
        artifacts: row.artifacts,
        case_type: row.caseType,
        decision_criteria: row.decisionCriteria,
        practical_notes: row.practicalNotes,
        check_question: row.checkQuestion,
        prompt: row.prompt,
        choices: row.choices,
        difficulty: row.difficulty,
        rationale: row.rationale,
        active: true,
        created_at: now,
      }),
    ),
  ];

  return `${statements.join("\n")}\n`;
}

async function main() {
  const [outputPath, service, account] = process.argv.slice(2);
  if (!outputPath || !service || !account) {
    throw new Error("usage: staging-seed.ts <output.sql> <keychain-service> <keychain-account>");
  }
  const { stdout: password } = await execFileAsync("security", [
    "find-generic-password",
    "-w",
    "-s",
    service,
    "-a",
    account,
  ]);
  const passwordHash = await hashPassword(password.trim());
  const sql = buildStagingSeedSql({
    userId: "user_staging",
    email: "staging-user@skill-compass.invalid",
    passwordHash,
  });
  await writeFile(outputPath, sql, { mode: 0o600 });
  await chmod(outputPath, 0o600);
  console.log("Staging-only seed SQL created.");
}

if (process.argv[1]?.endsWith("staging-seed.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "staging_seed_failed");
    process.exitCode = 1;
  });
}
