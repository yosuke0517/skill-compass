// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { RelayStore, type SqlDatabase } from "@/lib/interview/relay-store";
import { InterviewRelayService } from "@/lib/interview/relay-service";
const admin = { id: "admin", role: "admin", entitlements: new Set(["access.manage"]) };
function setup() {
  const sql = new DatabaseSync(":memory:");
  sql.exec(readFileSync("drizzle-d1/0002_interview_relay.sql", "utf8"));
  sql.exec(readFileSync("drizzle-d1/0003_interview_developer.sql", "utf8"));
  sql.exec(readFileSync("drizzle-d1/0004_interview_learning.sql", "utf8"));
  sql.exec(readFileSync("drizzle-d1/0005_interview_end_reason.sql", "utf8"));
  sql.exec("INSERT INTO interview_relay_allowance VALUES(1,2700000,100)");
  const db: SqlDatabase = {
    prepare(query) {
      let values: (string | number | null)[] = [];
      return {
        bind(...args) {
          values = args;
          return this;
        },
        async first<T>() {
          return (sql.prepare(query).get(...values) ?? null) as T | null;
        },
        async run() {
          return sql.prepare(query).run(...values);
        },
      };
    },
  };
  let time = 100_000,
    allowed = true;
  const store = new RelayStore(db, () => time),
    service = new InterviewRelayService(
      store,
      { mode: "mock", url: "ws://127.0.0.1:4318/audio" },
      async () => (allowed ? admin : null),
    );
  return {
    sql,
    store,
    service,
    tick: (n: number) => {
      time += n;
    },
    revoke: () => {
      allowed = false;
    },
  };
}
describe("start diagnostics without granting access", () => {
  it("recognizes a D1 wrapped trigger error without exposing wrapper details", async () => {
    const db: SqlDatabase = {
      prepare() {
        return {
          bind() {
            return this;
          },
          async run() {
            return {};
          },
          async first() {
            throw new Error("D1 query failed", {
              cause: new Error("allowance exhausted: SQLITE_CONSTRAINT"),
            });
          },
        };
      },
    };
    await expect(new RelayStore(db).ticket("owner", "trial")).rejects.toMatchObject({
      status: 409,
      code: "STANDARD_ALLOWANCE_EXHAUSTED",
    });
  });

  it("reports available modes using the exact owner and does not spend quota", async () => {
    const { store, sql } = setup();
    sql.exec(
      "UPDATE interview_relay_allowance SET duration_remaining=0,hints_remaining=0; INSERT INTO interview_relay_developers VALUES('admin',1,15000)",
    );
    expect(await store.availability("admin")).toEqual({
      trial: false,
      full: false,
      developer: true,
    });
    expect(await store.availability("other")).toEqual({
      trial: false,
      full: false,
      developer: false,
    });
    expect(
      sql.prepare("SELECT budget_microusd FROM interview_relay_developers").get()?.budget_microusd,
    ).toBe(15000);
    expect(sql.prepare("SELECT count(*) n FROM interview_relay_sessions").get()?.n).toBe(0);
  });
  it("separates standard allowance, developer permission and developer budget failures", async () => {
    const { store, sql } = setup();
    sql.exec("UPDATE interview_relay_allowance SET duration_remaining=0,hints_remaining=0");
    await expect(store.ticket("admin", "trial")).rejects.toMatchObject({
      status: 409,
      code: "STANDARD_ALLOWANCE_EXHAUSTED",
    });
    await expect(store.ticket("admin", "developer")).rejects.toMatchObject({
      code: "DEVELOPER_NOT_ALLOWED",
    });
    sql.exec("INSERT INTO interview_relay_developers VALUES('admin',1,14999)");
    await expect(store.ticket("admin", "developer")).rejects.toMatchObject({
      code: "DEVELOPER_BUDGET_EXHAUSTED",
    });
  });
  it("identifies an active connection without stopping it", async () => {
    const { store, sql } = setup();
    const session = await store.ticket("admin", "trial");
    await expect(store.ticket("admin", "trial")).rejects.toMatchObject({ code: "ACTIVE_SESSION" });
    expect(
      sql.prepare("SELECT state FROM interview_relay_sessions WHERE id=?").get(session.id)?.state,
    ).toBe("active");
  });
  it("does not disguise database faults as allowance errors or expose raw details", async () => {
    const { store, sql } = setup();
    sql.exec(
      "CREATE TRIGGER broken_storage BEFORE INSERT ON interview_relay_sessions BEGIN SELECT RAISE(ABORT,'synthetic private database detail'); END",
    );
    await expect(store.ticket("admin", "trial")).rejects.toMatchObject({
      status: 503,
      code: "START_DATABASE_ERROR",
    });
    await expect(store.ticket("admin", "trial")).rejects.not.toThrow(
      "synthetic private database detail",
    );
  });
});
describe("relay SQLite authorization and budget", () => {
  it("grants nobody on migration and rejects role/email/owner/developer claims from other admins", async () => {
    const { service, sql } = setup();
    expect(sql.prepare("SELECT count(*) AS n FROM interview_relay_developers").get()?.n).toBe(0);
    await expect(service.run("start", admin, { duration: "developer" })).rejects.toMatchObject({
      status: 409,
    });
    sql.exec("INSERT INTO interview_relay_developers VALUES('admin',1,1000000)");
    await expect(
      service.run(
        "start",
        { ...admin, id: "other-admin" },
        {
          duration: "developer",
          owner: "admin",
          userId: "admin",
          email: "owner@example.com",
          developer: true,
        },
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      service.run(
        "start",
        { ...admin, role: "normal", entitlements: new Set() },
        {
          duration: "developer",
        },
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("allows repeated developer starts and over 80 hint attempts without consuming standard quota", async () => {
    const { store, tick, sql } = setup();
    sql.exec(
      "UPDATE interview_relay_allowance SET duration_remaining=0,hints_remaining=0; INSERT INTO interview_relay_developers VALUES('admin',1,1000000)",
    );
    for (let run = 0; run < 2; run++) {
      const ticket = await store.ticket("admin", "developer");
      expect(ticket.usageMode).toBe("developer");
      expect(ticket.hintLimit).toBeNull();
      const grant = await store.redeem(ticket.ticket, "n");
      for (let i = 0; i < 81; i++) {
        tick(2500);
        await store.pulse(grant.id, "admin");
        await store.lease(grant.id, grant.generation, "n", true);
      }
      expect((await store.pulse(grant.id, "admin")).hintAttempts).toBe(81);
      await store.stop(grant.id, "admin");
      await store.release(grant.id, grant.generation, "n");
    }
    const allowance = sql.prepare("SELECT * FROM interview_relay_allowance").get();
    expect(allowance?.duration_remaining).toBe(0);
    expect(allowance?.hints_remaining).toBe(0);
    await expect(store.ticket("other-admin", "trial")).rejects.toMatchObject({ status: 409 });
  });
  it("atomically reserves estimated cost, rejects overspend, and never refunds on release/reconnect", async () => {
    const { store, tick, sql } = setup();
    sql.exec("INSERT INTO interview_relay_developers VALUES('admin',1,17000)");
    const t = await store.ticket("admin", "developer");
    const g = await store.redeem(t.ticket, "n");
    const remaining = () =>
      sql.prepare("SELECT budget_microusd AS n FROM interview_relay_developers").get()?.n;
    expect(remaining()).toBe(2000); // 30 seconds prepaid.
    const results = await Promise.allSettled([
      store.lease(g.id, 1, "n", true),
      store.lease(g.id, 1, "n", true),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(remaining()).toBe(0);
    tick(2500);
    await expect(store.lease(g.id, 1, "n", true)).rejects.toThrow();
    expect(remaining()).toBe(0);
    expect((await store.get(g.id))?.hints).toBe(1);
    await store.release(g.id, 1, "n");
    await store.pulse(g.id, "admin");
    const again = await store.ticket("admin", "trial", g.id);
    expect(again.usageMode).toBe("developer");
    expect(again.expiresAt).toBe(t.expiresAt);
    await expect(store.redeem(again.ticket, "next")).rejects.toThrow();
    expect(remaining()).toBe(0);
  });
  it("retains singleton, ticket replay, rate limit and developer revocation protections", async () => {
    const { store, sql } = setup();
    sql.exec("INSERT INTO interview_relay_developers VALUES('admin',1,1000000)");
    const t = await store.ticket("admin", "developer");
    await expect(store.ticket("admin", "developer")).rejects.toMatchObject({ status: 409 });
    const g = await store.redeem(t.ticket, "n");
    await expect(store.redeem(t.ticket, "replay")).rejects.toMatchObject({ status: 410 });
    await store.lease(g.id, 1, "n", true);
    await expect(store.lease(g.id, 1, "n", true)).rejects.toMatchObject({ status: 410 });
    sql.exec("UPDATE interview_relay_developers SET enabled=0");
    await expect(store.lease(g.id, 1, "n")).rejects.toThrow();
    await expect(store.pulse(g.id, "admin")).rejects.toThrow();
    await store.stop(g.id, "admin");
    await store.release(g.id, 1, "n");
  });
  it("reserves quota atomically; competing starts cannot allocate two sessions", async () => {
    const { store, sql } = setup();
    const results = await Promise.allSettled([
      store.ticket("admin", "trial"),
      store.ticket("admin", "trial"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      sql.prepare("SELECT duration_remaining FROM interview_relay_allowance").get()
        ?.duration_remaining,
    ).toBe(2400000);
  });
  it("stores only the hash and consumes a ticket once even on simultaneous redemption", async () => {
    const { store, sql } = setup();
    const t = await store.ticket("admin", "trial");
    expect(
      JSON.stringify(sql.prepare("SELECT * FROM interview_relay_sessions").get()),
    ).not.toContain(t.ticket);
    const replies = await Promise.allSettled([
      store.redeem(t.ticket, "one"),
      store.redeem(t.ticket, "two"),
    ]);
    expect(replies.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await expect(store.redeem(t.ticket, "three")).rejects.toMatchObject({ status: 410 });
  });
  it("rejects tickets at 30 seconds and owner spoofing", async () => {
    const { store, tick } = setup();
    const t = await store.ticket("admin", "trial");
    tick(30000);
    await expect(store.redeem(t.ticket, "one")).rejects.toMatchObject({ status: 410 });
    await expect(store.ticket("other", "trial", t.id)).rejects.toMatchObject({ status: 410 });
  });
  it("reconnect waits for release/lease expiry and preserves deadline and quota", async () => {
    const { store, tick, sql } = setup();
    const t = await store.ticket("admin", "full");
    const g = await store.redeem(t.ticket, "nonce");
    await expect(store.ticket("admin", "trial", t.id)).rejects.toMatchObject({ status: 410 });
    await store.release(g.id, g.generation, "wrong");
    await expect(store.ticket("admin", "trial", t.id)).rejects.toMatchObject({ status: 410 });
    await store.release(g.id, g.generation, g.nonce!);
    tick(1000);
    const next = await store.ticket("admin", "trial", t.id);
    expect(next.expiresAt).toBe(t.expiresAt);
    const newer = await store.redeem(next.ticket, "next");
    expect(newer.generation).toBe(2);
    await expect(store.lease(g.id, g.generation, g.nonce!)).rejects.toMatchObject({ status: 410 });
    expect(
      sql.prepare("SELECT hints_remaining FROM interview_relay_allowance").get()?.hints_remaining,
    ).toBe(20);
  });
  it("expires without browser heartbeat; preserves absolute 40-minute deadline", async () => {
    const { store, tick } = setup();
    const t = await store.ticket("admin", "full");
    const g = await store.redeem(t.ticket, "n");
    tick(15000);
    expect((await store.lease(g.id, 1, "n")).relay_until).toBe(130000);
    tick(15000);
    await expect(store.lease(g.id, 1, "n")).rejects.toMatchObject({ status: 410 });
    await store.pulse(g.id, "admin");
    await expect(store.lease(g.id, 1, "n")).rejects.toMatchObject({ status: 410 });
    tick(2370000);
    await expect(store.ticket("admin", "trial", t.id)).rejects.toMatchObject({ status: 410 });
  });
  it("rechecks admin on redeem, lease, and hint; rejects client role claims", async () => {
    const { service, store, revoke } = setup();
    const t = await store.ticket("admin", "trial");
    const grant = await service.relay("redeem", { ticket: t.ticket, nonce: "nonce" });
    revoke();
    await expect(service.relay("lease", grant)).rejects.toMatchObject({ status: 401 });
    await expect(service.relay("hint", grant)).rejects.toMatchObject({ status: 401 });
    await expect(
      service.run(
        "start",
        { ...admin, role: "normal", entitlements: new Set() },
        { role: "admin" },
      ),
    ).rejects.toMatchObject({ status: 403 });
    const x = setup();
    const ticket = await x.store.ticket("admin", "trial");
    x.revoke();
    await expect(
      x.service.relay("redeem", { ticket: ticket.ticket, nonce: "nonce" }),
    ).rejects.toMatchObject({ status: 401 });
  });
  it("atomically limits hint count/rate and preserves usage after stop/cleanup", async () => {
    const { store, tick, sql } = setup();
    const t = await store.ticket("admin", "trial");
    const g = await store.redeem(t.ticket, "n");
    const concurrent = await Promise.allSettled([
      store.lease(g.id, 1, "n", true),
      store.lease(g.id, 1, "n", true),
    ]);
    expect(concurrent.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (let i = 1; i < 20; i++) {
      tick(2500);
      await store.pulse(g.id, "admin");
      await store.lease(g.id, 1, "n", true);
    }
    tick(2500);
    await expect(store.lease(g.id, 1, "n", true)).rejects.toMatchObject({ status: 410 });
    await store.stop(g.id, "admin");
    await expect(store.lease(g.id, 1, "n")).rejects.toMatchObject({ status: 410 });
    await expect(store.ticket("admin", "full")).rejects.toMatchObject({ status: 409 });
    await store.release(g.id, 1, "n");
    const full = await store.ticket("admin", "full");
    await store.stop(full.id, "admin");
    tick(90_000_000);
    await expect(store.ticket("admin", "trial")).rejects.toMatchObject({ status: 409 });
    expect(
      sql.prepare("SELECT duration_remaining FROM interview_relay_allowance").get()
        ?.duration_remaining,
    ).toBe(0);
  });
  it("a stale session cannot be revived after a new session reserves the remaining budget", async () => {
    const { store, tick } = setup();
    const old = await store.ticket("admin", "trial");
    tick(30001);
    await store.ticket("admin", "full");
    await expect(store.pulse(old.id, "admin")).rejects.toMatchObject({ status: 410 });
    await expect(store.ticket("admin", "trial", old.id)).rejects.toMatchObject({ status: 410 });
  });
});
