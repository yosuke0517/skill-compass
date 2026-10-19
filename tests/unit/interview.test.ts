// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { InterviewMockService, InterviewError, INTERVIEW_DURATION_MS } from "@/lib/interview/mock-service";
import { createInterviewHandler } from "@/lib/interview/http";
const admin = { id: "a", role: "admin", entitlements: new Set(["access.manage"]) };
const operations = ["start", "stop", "reconnect", "pulse", "audio", "hint", "status"];
const req = (body: object, origin = "http://localhost:3000") => new Request("http://localhost:3000/api/admin/interview/start", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
describe("interview authorization boundary", () => {
  it("returns safe machine-readable start failure codes", async () => {
    const handler=createInterviewHandler({user:async()=>admin,enabled:()=>true,service:{run:async()=>{throw new InterviewError(503,"開始情報を保存できません。","START_DATABASE_ERROR");}}});
    const response=await handler(req({duration:"developer"}),"start");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({error:"開始情報を保存できません。",code:"START_DATABASE_ERROR"});
  });

  for (const user of [null, { ...admin, role: "normal", plan: "free" }, { ...admin, role: "normal", plan: "pro" }, { ...admin, entitlements: new Set<string>() }]) {
    for (const operation of operations) it(`rejects ${user?.role ?? "anonymous"}/${user && "plan" in user ? user.plan : "-"} at ${operation}`, async () => {
      const service = new InterviewMockService(); const run = vi.spyOn(service, "run");
      const handler = createInterviewHandler({ user: async () => user, service, enabled: () => true });
      expect((await handler(req({ role: "admin", plan: "pro", userId: "a" }), operation)).status).toBe(user ? 403 : 401);
      expect(run).not.toHaveBeenCalled();
    });
  }
  it("checks DB access for every operation, including revocation mid-session", async () => {
    let user = admin; const lookup = vi.fn(async () => user);
    const handler = createInterviewHandler({ user: lookup, service: new InterviewMockService(), enabled: () => true });
    const started = await (await handler(req({}), "start")).json();
    user = { ...admin, role: "normal" };
    for (const operation of operations) expect((await handler(req({ id: started.id }), operation)).status).toBe(403);
    expect(lookup).toHaveBeenCalledTimes(8);
  });
  it("rejects cross-origin, oversized bodies, malformed JSON, disabled deployment", async () => {
    const deps = { user: async () => admin, service: new InterviewMockService(), enabled: () => true };
    const handler = createInterviewHandler(deps);
    expect((await handler(req({}, "https://evil.example"), "start")).status).toBe(403);
    expect((await handler(req({ text: "x".repeat(9000) }), "hint")).status).toBe(413);
    expect((await createInterviewHandler({ ...deps, enabled: () => false })(req({}), "start")).status).toBe(503);
    expect((await handler(new Request("http://localhost:3000", { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body: "{" }), "start")).status).toBe(400);
  });
});
describe("interview lifecycle", () => {
  it("keeps a 40 minute deadline through reconnects and expires exactly", () => {
    let now = 0; const service = new InterviewMockService(() => now);
    const s = service.run("start", admin, {});
    for (now = 15_000; now < INTERVIEW_DURATION_MS; now += 15_000) {
      expect(service.run(now % 240_000 === 0 ? "reconnect" : "pulse", admin, { id: s.id }).expiresAt).toBe(INTERVIEW_DURATION_MS);
    }
    expect(() => service.run("reconnect", admin, { id: s.id })).toThrow("終了");
  });
  it("invalidates stop, repeated start, foreign ownership, idle sessions", () => {
    let now = 0; const service = new InterviewMockService(() => now);
    const first = service.run("start", admin, {}); const second = service.run("start", admin, {});
    expect(() => service.run("hint", admin, { id: first.id, text: "x" })).toThrow("終了");
    expect(() => service.run("stop", { ...admin, id: "b" }, { id: second.id })).toThrow("終了");
    service.run("stop", admin, { id: second.id });
    expect(() => service.run("audio", admin, { id: second.id })).toThrow("終了");
    const third = service.run("start", admin, {}); now = 60_001;
    expect(() => service.run("reconnect", admin, { id: third.id })).toThrow("終了");
  });
  it("accepts/discards PCM, deduplicates retries, rejects gaps and validates source", () => {
    const service = new InterviewMockService(); const s = service.run("start", admin, {});
    const chunk = { id: s.id, sequence: 1, source: "interviewer", pcm: Buffer.alloc(3200).toString("base64") };
    expect(service.run("audio", admin, chunk)).toMatchObject({ recognized: false });
    expect(service.run("audio", admin, chunk)).toMatchObject({ duplicate: true });
    expect(() => service.run("audio", admin, { ...chunk, sequence: 3 })).toThrow("欠落");
    expect(() => service.run("audio", admin, { ...chunk, source: "admin" })).toThrow("入力元");
  });
  it("returns only three structure hints and limits rapid requests", () => {
    const service = new InterviewMockService(); const s = service.run("start", admin, {});
    const result = service.run("hint", admin, { id: s.id, text: "困難な課題" });
    expect(result.lines).toHaveLength(3);
    expect(() => service.run("hint", admin, { id: s.id, text: "次" })).toThrow("上限");
  });
});
