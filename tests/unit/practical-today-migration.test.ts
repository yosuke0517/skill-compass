import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "drizzle/0016_practical_user_scoped_today.sql");
const journalPath = resolve(process.cwd(), "drizzle/meta/_journal.json");

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

  it("registers migration 0016 for the Drizzle migrator", () => {
    const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
      entries: Array<{ idx: number; version: string; when: number; tag: string; breakpoints: boolean }>;
    };
    const entry = journal.entries.find((candidate) => candidate.tag === "0016_practical_user_scoped_today");

    expect(entry).toMatchObject({
      idx: 15,
      version: "5",
      tag: "0016_practical_user_scoped_today",
      breakpoints: true,
    });
    expect(entry?.when).toEqual(expect.any(Number));
  });

  it("creates all user ownership foreign keys and user-scoped indexes", () => {
    const sql = readFileSync(migrationPath, "utf8");

    for (const table of ["quiz_days", "answers", "scores", "self_assessments"]) {
      expect(sql).toContain(
        `ALTER TABLE \`${table}\` ADD CONSTRAINT \`${table}_user_id_users_id_fk\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`)`,
      );
    }
    expect(sql).toContain("CREATE UNIQUE INDEX `quiz_days_user_date_idx` ON `quiz_days` (`user_id`,`quiz_date`)");
    expect(sql).toContain("CREATE INDEX `answers_user_quiz_day_idx` ON `answers` (`user_id`,`quiz_day_id`)");
    expect(sql).toContain("CREATE INDEX `answers_user_question_idx` ON `answers` (`user_id`,`question_id`)");
    expect(sql).toContain("CREATE UNIQUE INDEX `scores_user_subject_idx` ON `scores` (`user_id`,`subject_type`,`subject_id`)");
    expect(sql).toContain("CREATE INDEX `self_assessments_user_subject_idx` ON `self_assessments` (`user_id`,`subject_type`,`subject_id`)");
  });
});
