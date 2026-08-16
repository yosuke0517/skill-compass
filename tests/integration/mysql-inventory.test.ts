import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  buildMigrationInventory,
  serializeMigrationInventory,
} from "../../scripts/migration/inventory-mysql";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("MySQL to D1 migration inventory", () => {
  it("classifies every table declared by the current MySQL schema", () => {
    const schemaPath = path.join(projectRoot, "src/db/schema.ts");
    const schemaSource = readFileSync(schemaPath, "utf8");
    const inventory = buildMigrationInventory({
      projectRoot,
      schemaPath,
      tableCounts: {},
    });

    const declaredTables = [...schemaSource.matchAll(/mysqlTable\(\s*["']([^"']+)["']/g)]
      .map((match) => match[1])
      .sort();

    expect(inventory.tables.map((table) => table.name).sort()).toEqual(declaredTables);
    expect(inventory.tables.every((table) => Array.isArray(table.features))).toBe(true);
  });

  it("serializes counts and classifications without row values or secrets", () => {
    const inventory = buildMigrationInventory({
      projectRoot,
      schemaPath: path.join(projectRoot, "src/db/schema.ts"),
      tableCounts: { users: 1 },
    });
    const serialized = serializeMigrationInventory(inventory);

    expect(serialized).toContain('"rowCount": 1');
    expect(serialized).not.toContain("secret-user@example.com");
    expect(serialized).not.toMatch(/passwordHash|tokenHash|accessToken|refreshToken/i);
  });
});
