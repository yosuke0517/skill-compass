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
describe("relay SQLite authorization and budget", () => {
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
