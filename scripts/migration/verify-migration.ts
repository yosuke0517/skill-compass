import { readFile } from "node:fs/promises";

import { buildMigrationSnapshot, decryptSnapshot, migrationTableOrder, tableChecksum, type MigrationSnapshot } from "./types";

export type MigrationReport = {
  ok: boolean;
  failures: string[];
  counts: Record<string, number>;
  extras: Record<string, number>;
};

const foreignReferences = [
  ["tags", "category_id", "categories", "id"], ["invites", "invited_by_user_id", "users", "id"],
  ["plan_entitlements", "entitlement_id", "entitlements", "id"], ["user_entitlement_overrides", "user_id", "users", "id"],
  ["user_entitlement_overrides", "entitlement_id", "entitlements", "id"], ["audit_logs", "actor_user_id", "users", "id"],
  ["podcast_settings", "user_id", "users", "id"], ["source_podcast_settings", "user_id", "users", "id"],
  ["source_podcast_settings", "source_id", "sources", "id"], ["podcast_episodes", "user_id", "users", "id"],
  ["podcast_jobs", "episode_id", "podcast_episodes", "id"], ["podcast_assets", "episode_id", "podcast_episodes", "id"],
  ["podcast_audio_chunks", "episode_id", "podcast_episodes", "id"], ["podcast_chat_messages", "episode_id", "podcast_episodes", "id"],
  ["concept_tags", "concept_id", "concepts", "id"], ["concept_tags", "tag_id", "tags", "id"],
  ["concept_sources", "concept_id", "concepts", "id"], ["concept_sources", "source_id", "sources", "id"],
  ["questions", "concept_id", "concepts", "id"], ["questions", "source_id", "sources", "id"],
  ["quiz_days", "user_id", "users", "id"], ["quiz_day_questions", "quiz_day_id", "quiz_days", "id"],
  ["quiz_day_questions", "question_id", "questions", "id"], ["answers", "user_id", "users", "id"],
  ["answers", "quiz_day_id", "quiz_days", "id"], ["answers", "question_id", "questions", "id"],
  ["scores", "user_id", "users", "id"], ["self_assessments", "user_id", "users", "id"],
  ["oauth_connections", "user_id", "users", "id"], ["x_daily_tech_digest_cache", "user_id", "users", "id"],
  ["mcp_authorization_codes", "client_id", "mcp_oauth_clients", "id"], ["mcp_authorization_codes", "user_id", "users", "id"],
  ["mcp_access_tokens", "client_id", "mcp_oauth_clients", "id"], ["mcp_access_tokens", "user_id", "users", "id"],
  ["mcp_refresh_tokens", "client_id", "mcp_oauth_clients", "id"], ["mcp_refresh_tokens", "user_id", "users", "id"],
] as const;

export function verifyMigration(
  source: MigrationSnapshot,
  target: MigrationSnapshot,
  options: { allowTargetSuperset?: boolean } = {},
): MigrationReport {
  const failures: string[] = [];
  const counts: Record<string, number> = {};
  const extras: Record<string, number> = {};
  for (const [table, expected] of Object.entries(source.tables)) {
    const actual = target.tables[table];
    counts[table] = actual?.rows.length ?? 0;
    extras[table] = Math.max(0, (actual?.rows.length ?? 0) - expected.rows.length);
    if (!actual) {
      failures.push(`${table}:count_mismatch`);
      continue;
    }
    if (!options.allowTargetSuperset) {
      if (actual.rows.length !== expected.rows.length) failures.push(`${table}:count_mismatch`);
      else if (tableChecksum(actual.rows) !== expected.checksum) failures.push(`${table}:checksum_mismatch`);
      continue;
    }
    const keys = expected.primaryKey;
    const sourceKeys = new Set(expected.rows.map((row) => keys.map((key) => String(row[key])).join("\0")));
    const importedRows = actual.rows.filter((row) => sourceKeys.has(keys.map((key) => String(row[key])).join("\0")));
    if (importedRows.length !== expected.rows.length) failures.push(`${table}:source_rows_missing`);
    else if (tableChecksum(importedRows) !== expected.checksum) failures.push(`${table}:source_rows_mismatch`);
  }
  for (const [table, column, parentTable, parentColumn] of foreignReferences) {
    const parentValues = new Set((target.tables[parentTable]?.rows ?? []).map((row) => row[parentColumn]));
    const missing = (target.tables[table]?.rows ?? []).some((row) => row[column] !== null && row[column] !== undefined && !parentValues.has(row[column]));
    if (missing) failures.push(`${table}:${column}:foreign_reference_missing`);
  }
  return { ok: failures.length === 0, failures, counts, extras };
}

export async function readD1Snapshot(input: { accountId: string; databaseId: string; apiToken: string; source: MigrationSnapshot; fetchImpl?: typeof fetch }) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const data: Record<string, Array<Record<string, unknown>>> = {};
  for (const table of migrationTableOrder) {
    const response = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${input.accountId}/d1/database/${input.databaseId}/query`, {
      method: "POST",
      headers: { authorization: `Bearer ${input.apiToken}`, "content-type": "application/json" },
      body: JSON.stringify({ sql: `SELECT * FROM \`${table}\`` }),
    });
    if (!response.ok) throw new Error(`d1_verification_failed:${response.status}`);
    const body = await response.json() as { success?: boolean; result?: Array<{ results?: Array<Record<string, unknown>> }> };
    if (!body.success) throw new Error("d1_verification_failed");
    data[table] = body.result?.[0]?.results ?? [];
  }
  return buildMigrationSnapshot(data, { createdAt: input.source.createdAt, sourceSchema: input.source.sourceSchema });
}

async function main() {
  const artifactPath = process.argv[2];
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const passphrase = process.env.MIGRATION_PASSPHRASE;
  if (!artifactPath || !accountId || !databaseId || !apiToken || !passphrase) throw new Error("artifact path and Cloudflare migration environment are required");
  const source = decryptSnapshot(await readFile(artifactPath), passphrase);
  const target = await readD1Snapshot({ accountId, databaseId, apiToken, source });
  const report = verifyMigration(source, target, {
    allowTargetSuperset: process.argv.includes("--allow-target-superset"),
  });
  console.log(JSON.stringify(report));
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1]?.endsWith("verify-migration.ts")) main().catch((error) => { console.error(error instanceof Error ? error.message : "migration_verification_failed"); process.exitCode = 1; });
