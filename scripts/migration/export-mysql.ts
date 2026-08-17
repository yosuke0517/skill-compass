import { writeFile } from "node:fs/promises";

import mysql from "mysql2/promise";

import { buildMigrationSnapshot, encryptSnapshot, migrationTableOrder, primaryKeys } from "./types";

export async function exportMySql(input: {
  databaseUrl: string;
  sourceSchema: string;
  passphrase: string;
  outputPath: string;
  createdAt?: string;
}) {
  const pool = mysql.createPool({ uri: input.databaseUrl, dateStrings: false });
  try {
    const data: Record<string, Array<Record<string, unknown>>> = {};
    for (const table of migrationTableOrder) {
      const order = primaryKeys[table].map((column) => `\`${column}\``).join(", ");
      const [rows] = await pool.query(`SELECT * FROM \`${table}\` ORDER BY ${order}`);
      data[table] = rows as Array<Record<string, unknown>>;
    }
    const snapshot = buildMigrationSnapshot(data, {
      createdAt: input.createdAt ?? new Date().toISOString(),
      sourceSchema: input.sourceSchema,
    });
    await writeFile(input.outputPath, encryptSnapshot(snapshot, input.passphrase), { mode: 0o600 });
    return { tableCount: migrationTableOrder.length, rowCount: Object.values(snapshot.tables).reduce((sum, table) => sum + table.rows.length, 0) };
  } finally {
    await pool.end();
  }
}

async function main() {
  const outputPath = process.argv[2];
  const databaseUrl = process.env.DATABASE_URL;
  const passphrase = process.env.MIGRATION_PASSPHRASE;
  if (!outputPath || !databaseUrl || !passphrase) throw new Error("DATABASE_URL, MIGRATION_PASSPHRASE, and output path are required");
  const sourceSchema = new URL(databaseUrl).pathname.replace(/^\//, "") || "skill_compass";
  const report = await exportMySql({ databaseUrl, sourceSchema, passphrase, outputPath });
  console.log(`Encrypted migration artifact created (${report.tableCount} tables, ${report.rowCount} rows).`);
}

if (process.argv[1]?.endsWith("export-mysql.ts")) main().catch((error) => { console.error(error instanceof Error ? error.message : "mysql_export_failed"); process.exitCode = 1; });
