// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { interviewMigrations, migrationState } from "../../scripts/interview/migrations";

test("fresh and manually migrated databases converge without reapplying ALTER or granting quota", () => {
  const db = new DatabaseSync(":memory:");
  const snapshot = () => db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name LIKE 'interview_%'").all();
  for (const migration of interviewMigrations) {
    expect(migrationState(migration, snapshot())).toBe("missing");
    db.exec(readFileSync(migration.file, "utf8"));
    expect(migrationState(migration, snapshot())).toBe("applied");
  }
  for (const migration of interviewMigrations) expect(migrationState(migration, snapshot())).toBe("applied");
  expect(db.prepare("SELECT COUNT(*) AS n FROM interview_relay_allowance").get()?.n).toBe(0);
  expect(db.prepare("SELECT COUNT(*) AS n FROM interview_relay_developers").get()?.n).toBe(0);
  db.exec("DROP TRIGGER interview_learning_end");
  expect(() => migrationState(interviewMigrations[3], snapshot())).toThrow(/partial/);
  db.close();
});
