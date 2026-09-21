// @vitest-environment node
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dispatchNotifications } from "@/lib/notifications/dispatch";

function database(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE users(id TEXT PRIMARY KEY,status TEXT NOT NULL); CREATE TABLE quiz_days(id TEXT PRIMARY KEY,user_id TEXT,quiz_date INTEGER,prepared_at INTEGER); CREATE TABLE questions(id TEXT PRIMARY KEY,active INTEGER); CREATE TABLE quiz_day_questions(quiz_day_id TEXT,question_id TEXT,slot INTEGER,reason TEXT); CREATE TABLE answers(id TEXT PRIMARY KEY,user_id TEXT,quiz_day_id TEXT,question_id TEXT,correct INTEGER)");
  db.exec(readFileSync(join(process.cwd(), "drizzle-d1/0001_today_notifications.sql"), "utf8").replaceAll("--> statement-breakpoint", ""));
  db.prepare("INSERT INTO users VALUES ('u','active')").run();
  return db;
}
function d1(db: DatabaseSync): CloudflareEnv["DB"] {
  return { prepare(sql: string) { let args: SQLInputValue[]=[]; const s={bind(...v:SQLInputValue[]){args=v;return s},async first<T>(){return (db.prepare(sql).get(...args) as T|undefined)??null},async all<T>(){return {results:db.prepare(sql).all(...args) as T[],success:true,meta:{}}},async run(){const r=db.prepare(sql).run(...args);return {success:true,results:[],meta:{changes:Number(r.changes)}}},async raw<T>(){return db.prepare(sql).all(...args).map(Object.values) as T[]}};return s} } as unknown as CloudflareEnv["DB"];
}

describe("dispatchNotifications", () => {
  it("skips completed Today and disables gone endpoints", async () => {
    const db = database(); const now = new Date("2026-09-21T00:01:00Z");
    db.prepare("INSERT INTO push_subscriptions(id,user_id,endpoint,p256dh,auth,enabled,time,next_run_at) VALUES ('a','u','https://fcm.googleapis.com/a','p','a',1,'09:00',?)").run(Math.floor(now.getTime()/1000));
    let calls=0;
    const result = await dispatchNotifications(d1(db), async()=>{calls++;return 410}, now);
    expect(result).toEqual({sent:0,skipped:0,failed:1}); expect(calls).toBe(1);
    expect(db.prepare("SELECT enabled,last_error FROM push_subscriptions").get()).toEqual({enabled:0,last_error:"subscription_expired"});
  });

  it("claims but does not send when every active question is answered", async () => {
    const db = database(); const now = new Date("2026-09-21T00:01:00Z"); const epoch = Date.parse("2026-09-21T00:00:00Z") / 1000;
    db.prepare("INSERT INTO push_subscriptions(id,user_id,endpoint,p256dh,auth,enabled,time,next_run_at) VALUES ('a','u','https://fcm.googleapis.com/a','p','a',1,'09:00',?)").run(Math.floor(now.getTime()/1000));
    db.prepare("INSERT INTO quiz_days VALUES ('day','u',?,?)").run(epoch, epoch);
    db.prepare("INSERT INTO questions VALUES ('q',1)").run();
    db.prepare("INSERT INTO quiz_day_questions VALUES ('day','q',1,'x')").run();
    db.prepare("INSERT INTO answers VALUES ('answer','u','day','q',0)").run();
    let calls = 0;
    await expect(dispatchNotifications(d1(db), async () => { calls++; return 201; }, now)).resolves.toEqual({ sent: 0, skipped: 1, failed: 0 });
    expect(calls).toBe(0);
    expect(db.prepare("SELECT last_sent_date FROM push_subscriptions").get()).toEqual({ last_sent_date: "2026-09-21" });
  });

  it("records a safe error for thrown sends", async () => {
    const db=database(); const now=new Date("2026-09-21T00:01:00Z");
    db.prepare("INSERT INTO push_subscriptions(id,user_id,endpoint,p256dh,auth,enabled,time,next_run_at) VALUES ('a','u','https://fcm.googleapis.com/a','secret','secret',1,'09:00',?)").run(Math.floor(now.getTime()/1000));
    await expect(dispatchNotifications(d1(db), async()=>{throw new Error("contains secret")}, now)).resolves.toEqual({sent:0,skipped:0,failed:1});
    expect(db.prepare("SELECT enabled,last_error FROM push_subscriptions").get()).toEqual({enabled:1,last_error:"push_unavailable"});
  });

  it("reschedules yesterday's late reminder without consuming today's claim", async () => {
    const db=database(); const now=new Date("2026-09-21T15:01:00Z");
    const yesterdayDue = Date.parse("2026-09-21T23:59:00+09:00") / 1000;
    db.prepare("INSERT INTO push_subscriptions(id,user_id,endpoint,p256dh,auth,enabled,time,next_run_at) VALUES ('a','u','https://fcm.googleapis.com/a','p','a',1,'23:59',?)").run(yesterdayDue);
    let calls = 0;
    await expect(dispatchNotifications(d1(db), async () => { calls++; return 201; }, now)).resolves.toEqual({ sent: 0, skipped: 1, failed: 0 });
    expect(calls).toBe(0);
    expect(db.prepare("SELECT last_sent_date,next_run_at FROM push_subscriptions").get()).toEqual({
      last_sent_date: null,
      next_run_at: Date.parse("2026-09-22T23:59:00+09:00") / 1000,
    });
  });
});
