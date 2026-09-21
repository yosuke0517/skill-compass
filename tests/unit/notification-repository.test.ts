// @vitest-environment node
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NotificationRepository } from "@/lib/notifications/repository";

function d1(database: DatabaseSync): CloudflareEnv["DB"] {
  return {
    prepare(sql: string) {
      const values: SQLInputValue[] = [];
      const statement = {
        bind(...bindings: SQLInputValue[]) { values.splice(0, values.length, ...bindings); return statement; },
        async first<T>() { return (database.prepare(sql).get(...values) as T | undefined) ?? null; },
        async all<T>() { return { results: database.prepare(sql).all(...values) as T[], success: true, meta: {} }; },
        async run() {
          const result = database.prepare(sql).run(...values);
          return { success: true, results: [], meta: { changes: Number(result.changes) } };
        },
        async raw<T>() { return database.prepare(sql).all(...values).map(Object.values) as T[]; },
      };
      return statement;
    },
  } as unknown as CloudflareEnv["DB"];
}

function setup() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys=ON");
  database.exec("CREATE TABLE users(id TEXT PRIMARY KEY, status TEXT NOT NULL)");
  database.exec("CREATE TABLE quiz_days(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,quiz_date INTEGER NOT NULL,prepared_at INTEGER NOT NULL)");
  database.exec("CREATE TABLE questions(id TEXT PRIMARY KEY,active INTEGER NOT NULL)");
  database.exec("CREATE TABLE quiz_day_questions(quiz_day_id TEXT NOT NULL,question_id TEXT NOT NULL,slot INTEGER NOT NULL,reason TEXT NOT NULL,PRIMARY KEY(quiz_day_id,question_id))");
  database.exec("CREATE TABLE answers(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,quiz_day_id TEXT NOT NULL,question_id TEXT NOT NULL,correct INTEGER)");
  const migration = readFileSync(join(process.cwd(), "drizzle-d1/0001_today_notifications.sql"), "utf8").replaceAll("--> statement-breakpoint", "");
  database.exec(migration);
  database.prepare("INSERT INTO users VALUES (?,?)").run("user-1", "active");
  database.prepare("INSERT INTO users VALUES (?,?)").run("user-2", "active");
  return { database, repository: new NotificationRepository(d1(database)) };
}

const subscription = { endpoint: "https://fcm.googleapis.com/push/one", keys: { p256dh: "p".repeat(87), auth: "a".repeat(22) } };

describe("NotificationRepository", () => {
  it("defaults status and prevents an endpoint from moving between owners", async () => {
    const { repository } = setup();
    await expect(repository.status("user-1", subscription.endpoint)).resolves.toEqual({ enabled: false, time: "09:00", lastError: null });
    await repository.save("user-1", subscription, "10:15", new Date("2026-09-21T00:00:00Z"));
    await expect(repository.save("user-2", subscription, "11:00", new Date("2026-09-21T00:00:00Z"))).rejects.toThrow("subscription_conflict");
    await expect(repository.status("user-1", subscription.endpoint)).resolves.toEqual({ enabled: true, time: "10:15", lastError: null });
  });

  it("allows exactly one owner when different users save concurrently", async () => {
    const { database, repository } = setup();
    const now = new Date("2026-09-21T00:00:00Z");
    const results = await Promise.allSettled([
      repository.save("user-1", subscription, "10:15", now),
      repository.save("user-2", subscription, "11:00", now),
    ]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(({ status }) => status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toEqual(new Error("subscription_conflict"));
    expect(database.prepare("SELECT COUNT(*) AS count FROM push_subscriptions").get()).toEqual({ count: 1 });
  });

  it("allows only one daily claim", async () => {
    const { repository } = setup();
    const now = new Date("2026-09-21T01:15:00Z");
    await repository.save("user-1", subscription, "10:00", new Date("2026-09-20T00:00:00Z"));
    const [row] = await repository.due(now);
    expect(row).toBeDefined();
    const claims = await Promise.all([repository.claim(row, now), repository.claim(row, now)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect((await repository.due(now))[0]).toBeUndefined();
  });

  it("advances a stale schedule without consuming the current day", async () => {
    const { database, repository } = setup();
    const now = new Date("2026-09-21T01:15:00Z");
    await repository.save("user-1", subscription, "10:00", new Date("2026-09-20T00:00:00Z"));
    const [row] = await repository.due(now);
    const advances = await Promise.all([repository.advanceStale(row, now), repository.advanceStale(row, now)]);
    expect(advances.filter(Boolean)).toHaveLength(1);
    expect(database.prepare("SELECT last_sent_date,next_run_at FROM push_subscriptions").get()).toEqual({
      last_sent_date: null,
      next_run_at: Date.parse("2026-09-22T10:00:00+09:00") / 1000,
    });
  });

  it("does not claim after the owning account is disabled", async () => {
    const { database, repository } = setup();
    const now = new Date("2026-09-21T01:15:00Z");
    await repository.save("user-1", subscription, "10:00", new Date("2026-09-20T00:00:00Z"));
    const [row] = await repository.due(now);
    database.prepare("UPDATE users SET status='disabled' WHERE id='user-1'").run();
    await expect(repository.claim(row, now)).resolves.toBe(false);
  });

  it("rate limits test claims atomically", async () => {
    const { repository } = setup();
    const now = new Date("2026-09-21T00:00:00Z");
    await repository.save("user-1", subscription, "09:00", now);
    const claims = await Promise.all([repository.claimTest("user-1", subscription.endpoint, now), repository.claimTest("user-1", subscription.endpoint, now)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    await expect(repository.claimTest("user-1", subscription.endpoint, new Date(now.getTime() + 60_000))).resolves.not.toBeNull();
  });

  it("counts false answers complete but null answers pending", async () => {
    const { database, repository } = setup();
    const epoch = Date.parse("2026-09-21T00:00:00Z") / 1000;
    database.prepare("INSERT INTO quiz_days VALUES (?,?,?,?)").run("day", "user-1", epoch, epoch);
    database.prepare("INSERT INTO questions VALUES (?,1)").run("q1");
    database.prepare("INSERT INTO questions VALUES (?,1)").run("q2");
    database.prepare("INSERT INTO quiz_day_questions VALUES (?,?,?,?)").run("day", "q1", 1, "x");
    database.prepare("INSERT INTO quiz_day_questions VALUES (?,?,?,?)").run("day", "q2", 2, "x");
    database.prepare("INSERT INTO answers VALUES (?,?,?,?,?)").run("a1", "user-1", "day", "q1", 0);
    database.prepare("INSERT INTO answers VALUES (?,?,?,?,?)").run("a2", "user-1", "day", "q2", null);
    await expect(repository.isTodayComplete("user-1", "2026-09-21")).resolves.toBe(false);
    database.prepare("UPDATE answers SET correct=1 WHERE id='a2'").run();
    await expect(repository.isTodayComplete("user-1", "2026-09-21")).resolves.toBe(true);
  });
});
