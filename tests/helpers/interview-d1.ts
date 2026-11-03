import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync } from "node:fs";

/** Disposable D1 boundary backed by real SQLite, including the production triggers. */
export function interviewD1() {
  const sql = new DatabaseSync(":memory:");
  sql.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT,display_name TEXT,password_hash TEXT,
    status TEXT,role TEXT,plan TEXT,created_at INTEGER,updated_at INTEGER);
    CREATE TABLE plan_entitlements(plan_id TEXT,entitlement_id TEXT,enabled INTEGER);
    CREATE TABLE user_entitlement_overrides(user_id TEXT,entitlement_id TEXT,enabled INTEGER,updated_at INTEGER DEFAULT 0);
    INSERT INTO users VALUES('owner','owner@example.test','Owner','unused','active','admin','free',0,0);`);
  for (const name of ["0002_interview_relay", "0003_interview_developer", "0004_interview_learning", "0005_interview_end_reason"])
    sql.exec(readFileSync(`drizzle-d1/${name}.sql`, "utf8"));
  sql.exec("INSERT INTO interview_relay_allowance VALUES(1,7200000,160)");
  const db = {
    prepare(query: string) {
      let values: SQLInputValue[] = [];
      const statement = {
        bind(...bindings: SQLInputValue[]) { values = bindings; return statement; },
        async first<T>() { return (sql.prepare(query).get(...values) ?? null) as T | null; },
        async all<T>() { return { results: sql.prepare(query).all(...values) as T[], success: true, meta: {} }; },
        async raw<T>() { return sql.prepare(query).all(...values).map(Object.values) as T[]; },
        async run() { return sql.prepare(query).run(...values); },
      };
      return statement;
    },
  } as unknown as CloudflareEnv["DB"];
  return { db, sql };
}
