import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/sqlite-core";

import { answers, questions, quizDays } from "@/db/schema";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("D1 application schema boundary", () => {
  it("uses SQLite tables and keeps MySQL reachable only from migration code", () => {
    const schema = readFileSync(path.join(projectRoot, "src/db/schema.ts"), "utf8");
    const client = readFileSync(path.join(projectRoot, "src/db/client.ts"), "utf8");

    expect(schema).toContain('from "drizzle-orm/sqlite-core"');
    expect(schema).not.toMatch(/\bmysqlTable\b|drizzle-orm\/mysql-core/);
    expect(client).toContain("getDb");
    expect(client).toContain("env.DB");
    expect(client).not.toMatch(/mysql2|createPool/);
  });

  it("preserves JSON serialization, optional confidence, indexes, and foreign keys", () => {
    const answerConfig = getTableConfig(answers);
    const questionConfig = getTableConfig(questions);
    const quizDayConfig = getTableConfig(quizDays);

    expect(answerConfig.columns.find((column) => column.name === "confidence")?.notNull).toBe(false);
    expect(questionConfig.columns.find((column) => column.name === "choices")?.dataType).toBe("json");
    expect(answerConfig.foreignKeys.length).toBeGreaterThan(0);
    expect(quizDayConfig.indexes.some((index) => index.config.name === "quiz_days_user_date_idx")).toBe(true);
  });
});
