// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createCloudflareRelayService, DirectRelayAuthority } from "@/lib/interview/cloudflare-service";
import { interviewD1 } from "../helpers/interview-d1";
const admin = { id: "owner", role: "admin", entitlements: new Set(["access.manage"]) };
const config = { INTERVIEW_RELAY_TRANSPORT: "cloudflare", INTERVIEW_RELAY_MODE: "openai", PUBLIC_APP_URL: "https://app.example" };

describe("Cloudflare direct D1 authority", () => {
  it("leaves the app/status usable without a key and denies ticket reservation for start and reconnect", async () => {
    const { db, sql } = interviewD1();
    const service = createCloudflareRelayService({ ...config, DB: db });
    await expect(service.run("status", admin, {})).resolves.toMatchObject({ trial: true });
    for (const operation of ["start", "reconnect"])
      await expect(service.run(operation, admin, { id: "unused" })).rejects.toMatchObject({ status: 503, code: "OPENAI_KEY_UNAVAILABLE" });
    expect(sql.prepare("SELECT COUNT(*) AS count FROM interview_relay_sessions").get()?.count).toBe(0);
    expect(sql.prepare("SELECT duration_remaining FROM interview_relay_allowance").get()?.duration_remaining).toBe(7200000);
    sql.close();
  });
  it("redeems once through the current active-admin resolver, preserves quotas and releases without HTTP callbacks", async () => {
    const { db, sql } = interviewD1();
    const service = createCloudflareRelayService({ ...config, OPENAI_API_KEY: "synthetic-key", DB: db });
    const authority = new DirectRelayAuthority(service);
    const ticket = await service.run("start", admin, { duration: "full" }) as { id: string; ticket: string; expiresAt: number; relayUrl: string };
    expect(ticket.relayUrl).toBe("wss://app.example/api/interview/audio");
    expect(ticket.expiresAt - Date.now()).toBeGreaterThan(3599000);
    expect(sql.prepare("SELECT duration_remaining FROM interview_relay_allowance").get()?.duration_remaining).toBe(3600000);
    const signal = new AbortController().signal;
    const grant = await authority.call("redeem", { ticket: ticket.ticket, nonce: "nonce-one" }, signal);
    expect(grant).toMatchObject({ id: ticket.id, mode: "openai", owner: "owner", generation: 1, nonce: "nonce-one" });
    await expect(authority.call("redeem", { ticket: ticket.ticket, nonce: "replay" }, signal)).rejects.toMatchObject({ status: 410 });
    sql.exec("UPDATE users SET role='normal',plan='pro' WHERE id='owner'");
    await expect(authority.call("lease", { id: grant.id, generation: 1, nonce: grant.nonce }, signal)).rejects.toMatchObject({ status: 403 });
    await expect(authority.call("release", { id: grant.id, generation: 1, nonce: grant.nonce }, signal)).resolves.toBeDefined();
    sql.close();
  });
  it("does not mutate authority state for an already cancelled request", async () => {
    const { db, sql } = interviewD1();
    const service = createCloudflareRelayService({ ...config, OPENAI_API_KEY: "key", DB: db });
    const ticket = await service.run("start", admin, {}) as { ticket: string };
    const controller = new AbortController(); controller.abort();
    await expect(new DirectRelayAuthority(service).call("redeem", { ticket: ticket.ticket, nonce: "n" }, controller.signal)).rejects.toThrow();
    expect(sql.prepare("SELECT nonce FROM interview_relay_sessions").get()?.nonce).toBeNull();
    sql.close();
  });
});
