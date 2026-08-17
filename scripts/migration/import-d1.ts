import { readFile } from "node:fs/promises";

import type { MigrationScalar, MigrationSnapshot } from "./types";
import { decryptSnapshot } from "./types";
import { migrationTableOrder } from "./types";

export type D1Query = { sql: string; params: MigrationScalar[] };

export function buildD1Batches(snapshot: MigrationSnapshot, batchSize = 50): D1Query[][] {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) throw new Error("invalid_d1_batch_size");
  const queries: D1Query[] = [];
  for (const tableName of migrationTableOrder) {
    for (const row of snapshot.tables[tableName]?.rows ?? []) {
      const columns = Object.keys(row);
      if (columns.length === 0) continue;
      const primaryKey = snapshot.tables[tableName]?.primaryKey ?? [];
      const mutableColumns = columns.filter((column) => !primaryKey.includes(column));
      const conflictAction = mutableColumns.length > 0
        ? `DO UPDATE SET ${mutableColumns.map((column) => `\`${column}\` = excluded.\`${column}\``).join(", ")}`
        : "DO NOTHING";
      queries.push({
        sql: `INSERT INTO \`${tableName}\` (${columns.map((column) => `\`${column}\``).join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) ON CONFLICT (${primaryKey.map((column) => `\`${column}\``).join(", ")}) ${conflictAction}`,
        params: columns.map((column) => row[column] ?? null),
      });
    }
  }
  return Array.from({ length: Math.ceil(queries.length / batchSize) }, (_, index) => queries.slice(index * batchSize, (index + 1) * batchSize));
}

export async function importD1(input: { accountId: string; databaseId: string; apiToken: string; snapshot: MigrationSnapshot; fetchImpl?: typeof fetch }) {
  const fetchImpl = input.fetchImpl ?? fetch;
  let imported = 0;
  for (const batch of buildD1Batches(input.snapshot)) {
    const response = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${input.accountId}/d1/database/${input.databaseId}/query`, {
      method: "POST",
      headers: { authorization: `Bearer ${input.apiToken}`, "content-type": "application/json" },
      body: JSON.stringify(batch),
    });
    if (!response.ok) throw new Error(`d1_import_failed:${response.status}`);
    const body = await response.json() as { success?: boolean };
    if (!body.success) throw new Error("d1_import_failed");
    imported += batch.length;
  }
  return { imported };
}

async function main() {
  const artifactPath = process.argv[2];
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const passphrase = process.env.MIGRATION_PASSPHRASE;
  if (!artifactPath || !accountId || !databaseId || !apiToken || !passphrase) throw new Error("artifact path and Cloudflare migration environment are required");
  const snapshot = decryptSnapshot(await readFile(artifactPath), passphrase);
  const report = await importD1({ accountId, databaseId, apiToken, snapshot });
  console.log(`D1 migration completed (${report.imported} rows).`);
}

if (process.argv[1]?.endsWith("import-d1.ts")) main().catch((error) => { console.error(error instanceof Error ? error.message : "d1_import_failed"); process.exitCode = 1; });
