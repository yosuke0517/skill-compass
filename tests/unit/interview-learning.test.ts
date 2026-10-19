// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { LearningStore, purgeInterviewLearning } from "@/lib/interview/learning-store";
import { RelayStore, type SqlDatabase } from "@/lib/interview/relay-store";
import { InterviewRelayService } from "@/lib/interview/relay-service";
function setup() {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys=ON");
  for (const name of [
    "0002_interview_relay",
    "0003_interview_developer",
    "0004_interview_learning",
  ])
    sql.exec(readFileSync(`drizzle-d1/${name}.sql`, "utf8"));
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
  let now = 100000;
  const learning = new LearningStore(db, () => now),
    relay = new RelayStore(db, () => now);
  sql.exec("INSERT INTO interview_relay_allowance VALUES(1,2700000,100)");
  sql.exec("INSERT INTO interview_relay_developers VALUES('owner',1,1000000)");
  return { sql, db, learning, relay, expire: () => (now += 2592000001), now: () => now };
}
const request = {
  model: "gemini-test",
  promptVersion: "v1",
  body: {
    systemInstruction: { parts: [{ text: "確認観点のみ" }] },
    contents: [{ role: "user", parts: [{ text: '[{"text":"質問"}]' }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 512 },
  },
};
describe("opt-in learning history", () => {
  it("defaults off and rejects opt-in until rollout is enabled", async () => {
    const { relay, sql } = setup();
    const admin = { id: "owner", role: "admin", entitlements: new Set(["access.manage"]) };
    const service = new InterviewRelayService(
      relay,
      { mode: "mock", url: "ws://localhost" },
      async () => admin,
    );
    await expect(service.run("start", admin, { saveLearning: true })).rejects.toMatchObject({
      status: 503,
    });
    await relay.ticket("owner", "developer");
    expect(sql.prepare("SELECT count(*) n FROM interview_learning_sessions").get()?.n).toBe(0);
  });
  it("stores exact request/version, separate delivery, feedback, and survives control cleanup", async () => {
    const { relay, learning, sql } = setup();
    const session = await relay.ticket("owner", "developer", undefined, true);
    const turn = randomUUID(),
      generation = randomUUID();
    await learning.record(session.id, "owner", {
      kind: "turn",
      eventId: turn,
      source: "interviewer",
      text: "完全な質問",
    });
    await learning.record(session.id, "owner", {
      kind: "request",
      eventId: generation,
      turnIds: [turn],
      request,
    });
    await learning.record(session.id, "owner", {
      kind: "result",
      eventId: generation,
      status: "success",
      lines: ["確認", "構成"],
      output: "確認\n構成",
      errorCode: null,
      latencyMs: 17,
    });
    await learning.record(session.id, "owner", { kind: "sent", eventId: generation });
    await learning.run("displayed", "owner", { sessionId: session.id, generationId: generation });
    await learning.run("rate", "owner", {
      sessionId: session.id,
      generationId: generation,
      rating: "helpful",
      comment: "具体的",
    });
    sql.prepare("DELETE FROM interview_relay_sessions WHERE id=?").run(session.id);
    const detail = (await learning.run("detail", "owner", { sessionId: session.id })) as {
      generations: Array<Record<string, unknown>>;
    };
    expect(detail.generations[0]).toMatchObject({
      request,
      status: "success",
      latencyMs: 17,
      rating: "helpful",
      sentAt: 100000,
      displayedAt: 100000,
    });
  });
  it("denies other owners across reads, export, delete and feedback", async () => {
    const { relay, learning } = setup();
    const { id } = await relay.ticket("owner", "developer", undefined, true);
    for (const op of ["detail", "export", "delete", "rate", "displayed"])
      await expect(
        learning.run(op, "other", { sessionId: id, generationId: randomUUID() }),
      ).rejects.toMatchObject({ status: 404 });
    expect(await learning.run("list", "other", {})).toBe("[]");
  });
  it("deletion cascades and late callbacks cannot recreate history", async () => {
    const { relay, learning, sql } = setup();
    const { id } = await relay.ticket("owner", "developer", undefined, true);
    const event = { kind: "turn", eventId: randomUUID(), source: "interviewer", text: "質問" };
    await learning.record(id, "owner", event);
    await learning.run("delete", "owner", { sessionId: id });
    expect(sql.prepare("SELECT count(*) n FROM interview_learning_turns").get()?.n).toBe(0);
    await expect(learning.record(id, "owner", event)).rejects.toMatchObject({ status: 404 });
  });
  it("immediately excludes expired records then purges children", async () => {
    const { relay, learning, sql, db, expire, now } = setup();
    const { id } = await relay.ticket("owner", "developer", undefined, true);
    await learning.record(id, "owner", {
      kind: "turn",
      eventId: randomUUID(),
      source: "interviewer",
      text: "質問",
    });
    expire();
    await expect(learning.run("detail", "owner", { sessionId: id })).rejects.toMatchObject({
      status: 404,
    });
    await purgeInterviewLearning(db, now());
    expect(sql.prepare("SELECT count(*) n FROM interview_learning_turns").get()?.n).toBe(0);
  });
  it("bounds each page and validates offsets", async () => {
    const { relay, learning } = setup();
    const { id } = await relay.ticket("owner", "developer", undefined, true);
    for (let n = 0; n < 11; n++)
      await learning.record(id, "owner", {
        kind: "turn",
        eventId: randomUUID(),
        source: "interviewer",
        text: `質問${n}`,
      });
    const first = (await learning.run("detail", "owner", { sessionId: id })) as {
      turns: unknown[];
    };
    const second = (await learning.run("export", "owner", { sessionId: id, offset: 10 })) as {
      turns: unknown[];
    };
    expect(first.turns).toHaveLength(10);
    expect(second.turns).toHaveLength(1);
    await expect(
      learning.run("detail", "owner", { sessionId: id, offset: -1 }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
