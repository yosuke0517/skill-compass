import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import ts from "typescript";

export type SchemaFeature =
  | "enum"
  | "json"
  | "timestamp"
  | "datetime"
  | "date"
  | "on-update-timestamp"
  | "index"
  | "unique-index"
  | "foreign-key"
  | "composite-primary-key";

export type QueryFeature =
  | "mysql-upsert"
  | "affected-rows"
  | "raw-sql"
  | "transaction";

export type MigrationInventory = {
  generatedAt: string;
  schemaPath: string;
  tables: Array<{ name: string; rowCount: number | null; features: SchemaFeature[] }>;
  querySites: Array<{ path: string; features: QueryFeature[] }>;
};

type InventoryInput = {
  projectRoot: string;
  schemaPath: string;
  tableCounts: Record<string, number>;
};

const schemaFeaturePatterns: Array<[SchemaFeature, RegExp]> = [
  ["enum", /\bmysqlEnum\s*\(/],
  ["json", /\bjson\s*\(/],
  ["timestamp", /\btimestamp\s*\(/],
  ["datetime", /\bdatetime\s*\(/],
  ["date", /\bdate\s*\(/],
  ["on-update-timestamp", /\.onUpdateNow\s*\(/],
  ["unique-index", /\buniqueIndex\s*\(/],
  ["index", /\bindex\s*\(/],
  ["foreign-key", /\.references\s*\(/],
  ["composite-primary-key", /\bprimaryKey\s*\(\s*\{\s*columns\s*:\s*\[[^\]]+,/s],
];

const queryFeaturePatterns: Array<[QueryFeature, RegExp]> = [
  ["mysql-upsert", /\.onDuplicateKeyUpdate\s*\(/],
  ["affected-rows", /\b(?:affectedRows|changedRows|insertId)\b/],
  ["raw-sql", /\bsql(?:<[^>]+>)?`/],
  ["transaction", /\.transaction\s*\(/],
];

export function buildMigrationInventory(input: InventoryInput): MigrationInventory {
  const schemaSource = readFileSync(input.schemaPath, "utf8");
  const sourceFile = ts.createSourceFile(input.schemaPath, schemaSource, ts.ScriptTarget.Latest, true);
  const tables: MigrationInventory["tables"] = [];

  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === "mysqlTable"
      && node.arguments.length >= 2
      && ts.isStringLiteralLike(node.arguments[0])
    ) {
      const name = node.arguments[0].text;
      const declarationText = node.parent.getText(sourceFile);
      const features = schemaFeaturePatterns
        .filter(([, pattern]) => pattern.test(declarationText))
        .map(([feature]) => feature);
      tables.push({ name, rowCount: input.tableCounts[name] ?? null, features });
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  return {
    generatedAt: new Date().toISOString(),
    schemaPath: path.relative(input.projectRoot, input.schemaPath),
    tables: tables.sort((left, right) => left.name.localeCompare(right.name)),
    querySites: scanQuerySites(input.projectRoot),
  };
}

export function serializeMigrationInventory(inventory: MigrationInventory): string {
  return `${JSON.stringify(inventory, null, 2)}\n`;
}

function scanQuerySites(projectRoot: string): MigrationInventory["querySites"] {
  const sourceRoot = path.join(projectRoot, "src");
  return walk(sourceRoot)
    .filter((file) => /\.(?:ts|tsx)$/.test(file))
    .map((file) => {
      const source = readFileSync(file, "utf8");
      const features = queryFeaturePatterns
        .filter(([, pattern]) => pattern.test(source))
        .map(([feature]) => feature);
      return { path: path.relative(projectRoot, file), features };
    })
    .filter((site) => site.features.length > 0)
    .sort((left, right) => left.path.localeCompare(right.path));
}

function walk(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const candidate = path.join(root, entry);
    if (statSync(candidate).isDirectory()) files.push(...walk(candidate));
    else files.push(candidate);
  }
  return files;
}
