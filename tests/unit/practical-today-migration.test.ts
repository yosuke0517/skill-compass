import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "drizzle/0016_practical_user_scoped_today.sql");

describe("practical user-scoped Today migration", () => {
  it("backfills legacy learner state without deleting question or answer history", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("UPDATE `quiz_days` SET `user_id` = 'user_local'");
    expect(sql).toContain("UPDATE `answers` SET `user_id` = 'user_local'");
    expect(sql).toContain("UPDATE `scores` SET `user_id` = 'user_local'");
    expect(sql).toContain("UPDATE `self_assessments` SET `user_id` = 'user_local'");
    expect(sql).toContain("UNIQUE INDEX `quiz_days_user_date_idx`");
    expect(sql).not.toMatch(/DELETE FROM `questions`/i);
    expect(sql).not.toMatch(/DELETE FROM `answers`/i);
  });

  it("adds nullable ownership before backfilling and requiring it", () => {
    const sql = readFileSync(migrationPath, "utf8");
    for (const table of ["quiz_days", "answers", "scores", "self_assessments"]) {
      const nullableOwnership = sql.indexOf(`ALTER TABLE \`${table}\` ADD \`user_id\` varchar(64)`);
      const backfill = sql.indexOf(`UPDATE \`${table}\` SET \`user_id\` = 'user_local'`);
      const requiredOwnership = sql.indexOf(`ALTER TABLE \`${table}\` MODIFY \`user_id\` varchar(64) NOT NULL`);

      expect(nullableOwnership).toBeGreaterThanOrEqual(0);
      expect(backfill).toBeGreaterThan(nullableOwnership);
      expect(requiredOwnership).toBeGreaterThan(backfill);
    }
  });
});
