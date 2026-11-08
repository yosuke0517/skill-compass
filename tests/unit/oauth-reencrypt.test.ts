import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  openBackup,
  prepareReencrypt,
  runOAuthReencrypt,
  type OAuthCipherRow,
  type ReencryptDatabase,
  type SqlStatement,
} from "@/lib/integrations/oauth-reencrypt";
import { openOAuthToken, sealOAuthToken } from "@/lib/integrations/oauth-tokens";
import { reencryptHoldResponse, reencryptSecretsFromBindings, runScheduledReencrypt } from "@/lib/integrations/oauth-reencrypt-worker";

const currentSession = "current-session-secret-32-characters";
const newOAuth = "new-oauth-encryption-secret-32ch";
const newSession = "replacement-session-secret-32-ch";
const access = "fake-access-token";
const refresh = "fake-refresh-token";

function database(initial: OAuthCipherRow[], failBatch = false, tamperOnBatch = false): ReencryptDatabase & {
    rows: () => OAuthCipherRow[];
  batches: SqlStatement[][];
  damage: (id: string) => void;
} {
  let rows = initial.map((row) => ({ ...row }));
  const runs = new Set<string>();
  const guards = new Set<string>();
  const batches: SqlStatement[][] = [];
  return {
    batches,
    rows: () => rows.map((row) => ({ ...row })),
    damage(id: string) {
      const row = rows.find((item) => item.id === id);
      if (row) row.accessTokenCiphertext = "damaged";
    },
    async query(sql, params = []) {
      if (sql.includes("oauth_reencrypt_runs")) {
        return (runs.has(String(params[0])) ? [{ nonce: params[0] }] : []) as never[];
      }
      return rows.map((row) => ({
        id: row.id,
        access_token_ciphertext: row.accessTokenCiphertext,
        refresh_token_ciphertext: row.refreshTokenCiphertext,
      })) as never[];
    },
    async batch(statements) {
      batches.push(statements);
      if (tamperOnBatch && rows[0]) rows[0].accessTokenCiphertext = "in-flight-writer";
      if (failBatch) throw new Error("database rejected the batch");
      const snapshot = rows.map((row) => ({ ...row }));
      const savedRuns = new Set(runs);
      const savedGuards = new Set(guards);
      try {
        for (const statement of statements) apply(statement);
      } catch (error) {
        rows = snapshot;
        runs.clear();
        for (const run of savedRuns) runs.add(run);
        guards.clear();
        for (const guard of savedGuards) guards.add(guard);
        throw error;
      }
    },
  };

  function apply(statement: SqlStatement) {
    if (statement.sql.startsWith("CREATE")) return;
    if (statement.sql.startsWith("DELETE FROM oauth_reencrypt_runs")) {
      runs.delete(String(statement.params[0]));
      return;
    }
    if (statement.sql.startsWith("DELETE FROM oauth_reencrypt_guards")) {
      const nonce = String(statement.params[0]);
      for (const key of [...guards]) if (key.startsWith(`${nonce}:`)) guards.delete(key);
      return;
    }
    if (statement.sql.startsWith("INSERT INTO oauth_reencrypt_runs")) {
      const nonce = String(statement.params[0]);
      if (runs.has(nonce)) throw new Error("constraint");
      runs.add(nonce);
      return;
    }
    if (statement.sql.startsWith("INSERT INTO oauth_reencrypt_guards (nonce, id) VALUES")) {
      const key = `${statement.params[0]}:${statement.params[1]}`;
      if (guards.has(key)) throw new Error("constraint");
      guards.add(key);
      return;
    }
    if (statement.sql.startsWith("INSERT INTO oauth_reencrypt_guards")) {
      const id = String(statement.params[1]);
      const expectedAccess = String(statement.params[3]);
      const expectedRefresh = statement.params[4];
      const row = rows.find((item) => item.id === id);
      const refreshMatches = expectedRefresh === null
        ? row?.refreshTokenCiphertext === null
        : row?.refreshTokenCiphertext === expectedRefresh;
      if (row?.accessTokenCiphertext === expectedAccess && refreshMatches) return;
      const key = `${statement.params[0]}:${id}`;
      if (guards.has(key)) throw new Error("constraint");
      guards.add(key);
      return;
    }
    if (statement.sql.startsWith("UPDATE")) {
      const [accessTokenCiphertext, refreshTokenCiphertext, id, previousAccess, previousRefresh] = statement.params;
      if (statement.params.length === 3) {
        const direct = rows.find((item) => item.id === id);
        if (!direct) throw new Error("missing");
        direct.accessTokenCiphertext = String(accessTokenCiphertext);
        direct.refreshTokenCiphertext = refreshTokenCiphertext === null ? null : String(refreshTokenCiphertext);
        return;
      }
      const row = rows.find((item) => item.id === id && item.accessTokenCiphertext === previousAccess);
      const refreshMatches = previousRefresh === null
        ? row?.refreshTokenCiphertext === null
        : row?.refreshTokenCiphertext === previousRefresh;
      if (!row || !refreshMatches) return;
      row.accessTokenCiphertext = String(accessTokenCiphertext);
      row.refreshTokenCiphertext = refreshTokenCiphertext === null ? null : String(refreshTokenCiphertext);
    }
  }
}

function backupSink() {
  const values = new Map<string, string>();
  return {
    values,
    async put(nonce: string, envelope: string) {
      values.set(nonce, envelope);
    },
    async get(nonce: string) {
      return values.get(nonce) ?? null;
    },
  };
}

const production = { databaseName: "skill-compass-production" };

function sealedRow(id: string, refreshToken: string | null = refresh): OAuthCipherRow {
  return {
    id,
    accessTokenCiphertext: sealOAuthToken(access, currentSession),
    refreshTokenCiphertext: refreshToken === null ? null : sealOAuthToken(refreshToken, currentSession),
  };
}

describe("oauth reencrypt", () => {
  it("keeps the existing v1 format and blocks apply when any row cannot be opened", async () => {
    const good = sealedRow("row-1");
    const bad = { ...sealedRow("row-2"), accessTokenCiphertext: "legacy-token" };
    const store = database([good, bad]);
    const result = await runOAuthReencrypt(store, {
      mode: "apply",
      ...production,
      backup: backupSink(),
      maintenanceReadOnly: true,
      currentSessionSecret: currentSession,
      newOAuthSecret: newOAuth,
      newSessionSecret: newSession,
      nonce: "nonce-0001",
    });

    expect(result).toMatchObject({ ok: false, total: 2, ready: 1, written: 0 });
    expect(store.batches).toHaveLength(0);
    expect(store.rows()[0]?.accessTokenCiphertext).toBe(good.accessTokenCiphertext);
    expect(openOAuthToken(good.accessTokenCiphertext, currentSession)).toBe(access);
  });

  it("refuses to reuse the current session secret as the new dedicated key", async () => {
    const store = database([sealedRow("row-1")]);
    const result = await runOAuthReencrypt(store, {
      mode: "plan",
      ...production,
      maintenanceReadOnly: true,
      currentSessionSecret: currentSession,
      newOAuthSecret: currentSession,
      newSessionSecret: newSession,
    });

    expect(result.ok).toBe(false);
    expect(store.batches).toHaveLength(0);
  });

  it("rewrites every row in one batch and restores the previous ciphertext", async () => {
    const original = [sealedRow("row-1"), sealedRow("row-2", null)];
    const store = database(original);
    const sink = backupSink();
    const applied = await runOAuthReencrypt(store, {
      mode: "apply",
      ...production,
      backup: sink,
      maintenanceReadOnly: true,
      currentSessionSecret: currentSession,
      newOAuthSecret: newOAuth,
      newSessionSecret: newSession,
      nonce: "nonce-0002",
    });
    const envelope = sink.values.get("nonce-0002") ?? "";

    expect(applied).toMatchObject({ ok: true, total: 2, ready: 2, written: 2 });
    expect(store.batches).toHaveLength(1);
    expect(store.batches[0]?.filter((statement) => statement.sql.startsWith("UPDATE"))).toHaveLength(2);
    expect(openOAuthToken(store.rows()[0]!.accessTokenCiphertext, newOAuth)).toBe(access);
    expect(store.rows()[1]?.refreshTokenCiphertext).toBeNull();
    expect(envelope.includes(access)).toBe(false);
    expect(envelope.includes(refresh)).toBe(false);
    expect(openBackup(envelope, newOAuth)?.[0]?.accessTokenCiphertext).toBe(original[0]?.accessTokenCiphertext);

    const afterApply = store.rows()[0]?.accessTokenCiphertext;
    const swapped = await runOAuthReencrypt(store, {
      mode: "apply",
      ...production,
      backup: sink,
      maintenanceReadOnly: true,
      currentSessionSecret: newSession,
      newOAuthSecret: newOAuth,
      newSessionSecret: "another-session-secret-32-chars-x",
      nonce: "nonce-0002",
    });
    const swappedRestore = await runOAuthReencrypt(store, {
      mode: "restore",
      ...production,
      backup: sink,
      maintenanceReadOnly: true,
      currentSessionSecret: newSession,
      newOAuthSecret: newOAuth,
      nonce: "nonce-0002",
    });

    expect(swapped).toMatchObject({ ok: true, already: true, written: 0 });
    expect(swappedRestore).toMatchObject({ ok: true, already: true, restored: 0 });
    expect(store.batches).toHaveLength(1);
    expect(store.rows()[0]?.accessTokenCiphertext).toBe(afterApply);
    expect(openOAuthToken(store.rows()[0]!.accessTokenCiphertext, newOAuth)).toBe(access);

    const sessionPutWithoutNewKey = await runOAuthReencrypt(store, {
      mode: "restore",
      ...production,
      backup: sink,
      maintenanceReadOnly: true,
      currentSessionSecret: newSession,
      newOAuthSecret: "short",
      nonce: "nonce-0002",
    });
    expect(sessionPutWithoutNewKey).toMatchObject({ ok: false, restored: 0, written: 0 });
    expect(store.rows()[0]?.accessTokenCiphertext).toBe(afterApply);
    expect(() => openOAuthToken(afterApply!, newSession)).toThrow();
    expect(JSON.stringify(sessionPutWithoutNewKey)).not.toContain(currentSession);
    expect(JSON.stringify(sessionPutWithoutNewKey)).not.toContain(newOAuth);
  });

  it("restores from an independent sink after the production batch is lost", async () => {
    const original = sealedRow("row-1");
    const store = database([original]);
    const sink = backupSink();
    await runOAuthReencrypt(store, {
      mode: "apply",
      ...production,
      backup: sink,
      maintenanceReadOnly: true,
      currentSessionSecret: currentSession,
      newOAuthSecret: newOAuth,
      newSessionSecret: newSession,
      nonce: "nonce-0004",
    });
    store.damage("row-1");

    const restored = await runOAuthReencrypt(store, {
      mode: "restore",
      ...production,
      backup: sink,
      maintenanceReadOnly: true,
      currentSessionSecret: currentSession,
      newOAuthSecret: newOAuth,
      nonce: "nonce-0004",
    });

    expect(restored).toMatchObject({ ok: true, restored: 1 });
    expect(store.rows()[0]?.accessTokenCiphertext).toBe(original.accessTokenCiphertext);
    expect(sink.values.get("nonce-0004")?.includes(access)).toBe(false);
  });

  it("does not apply without the independent backup or the production database name", async () => {
    const original = sealedRow("row-1");
    const store = database([original]);
    const missingBackup = await runOAuthReencrypt(store, {
      mode: "apply",
      ...production,
      maintenanceReadOnly: true,
      currentSessionSecret: currentSession,
      newOAuthSecret: newOAuth,
      newSessionSecret: newSession,
      nonce: "nonce-0005",
    });
    const wrongDatabase = await runOAuthReencrypt(database([original]), {
      mode: "apply",
      databaseName: "skill-compass-staging",
      backup: backupSink(),
      maintenanceReadOnly: true,
      currentSessionSecret: currentSession,
      newOAuthSecret: newOAuth,
      newSessionSecret: newSession,
      nonce: "nonce-0005",
    });

    expect(missingBackup.ok).toBe(false);
    expect(wrongDatabase.ok).toBe(false);
    expect(store.batches).toHaveLength(0);
    expect(store.rows()[0]?.accessTokenCiphertext).toBe(original.accessTokenCiphertext);
  });

  it("rolls back when a row changes between the read and the batch", async () => {
    const original = sealedRow("row-1");
    const store = database([original], false, true);

    const result = await runOAuthReencrypt(store, {
      mode: "apply",
      ...production,
      backup: backupSink(),
      maintenanceReadOnly: true,
      currentSessionSecret: currentSession,
      newOAuthSecret: newOAuth,
      newSessionSecret: newSession,
      nonce: "nonce-0006",
    });

    expect(result.ok).toBe(false);
    expect(result.written).toBe(0);
    expect(store.rows()[0]?.accessTokenCiphertext).toBe("in-flight-writer");
  });

  it("leaves the stored rows unchanged when the batch fails", async () => {
    const original = sealedRow("row-1");
    const store = database([original], true);
    const result = await runOAuthReencrypt(store, {
      mode: "apply",
      ...production,
      backup: backupSink(),
      maintenanceReadOnly: true,
      currentSessionSecret: currentSession,
      newOAuthSecret: newOAuth,
      newSessionSecret: newSession,
      nonce: "nonce-0003",
    });

    expect(result.ok).toBe(false);
    expect(result.written).toBe(0);
    expect(store.rows()[0]?.accessTokenCiphertext).toBe(original.accessTokenCiphertext);
  });

  it("applies the dedicated key without a replacement session secret", async () => {
    const store = database([sealedRow("row-1")]);
    const result = await runOAuthReencrypt(store, {
      mode: "apply",
      ...production,
      backup: backupSink(),
      maintenanceReadOnly: true,
      currentSessionSecret: currentSession,
      newOAuthSecret: newOAuth,
      nonce: "nonce-stage-a",
    });

    expect(result).toMatchObject({ ok: true, written: 1 });
    expect(openOAuthToken(store.rows()[0]!.accessTokenCiphertext, newOAuth)).toBe(access);
    expect(JSON.stringify(result)).not.toContain(currentSession);
  });

  it("does not report a plan while writers are still allowed", async () => {
    const result = await runOAuthReencrypt(database([sealedRow("row-1")]), {
      mode: "plan",
      ...production,
      maintenanceReadOnly: false,
      currentSessionSecret: currentSession,
      newOAuthSecret: newOAuth,
    });

    expect(result.ok).toBe(false);
  });

  it("prepares a replacement that round-trips and does not include plaintext in the result counts", () => {
    const prepared = prepareReencrypt([sealedRow("row-1")], currentSession, newOAuth);
    expect(prepared.ok).toBe(true);
    expect(JSON.stringify(prepared.counts)).not.toContain(access);
    expect(openOAuthToken(prepared.rows[0]!.accessTokenCiphertext, newOAuth)).toBe(access);
  });
});

describe("oauth reencrypt bindings", () => {
  it("uses the dedicated binding as the new key and the session binding as the source", () => {
    expect(reencryptSecretsFromBindings({
      DB: {} as never,
      SESSION_SECRET: currentSession,
      OAUTH_TOKEN_ENCRYPTION_SECRET: newOAuth,
    })).toEqual({ currentSessionSecret: currentSession, newOAuthSecret: newOAuth });
    expect(reencryptSecretsFromBindings({
      DB: {} as never,
      SESSION_SECRET: currentSession,
      OAUTH_TOKEN_ENCRYPTION_SECRET: newOAuth,
      OAUTH_REENCRYPT_NEW_SECRET: "another-oauth-secret-32-characters",
    })).toBeNull();
  });
});

describe("oauth reencrypt worker gate", () => {
  it("closes HTTP while a one-shot mode is armed and stays silent otherwise", async () => {
    const held = reencryptHoldResponse({ OAUTH_REENCRYPT_MODE: "plan" });
    expect(held?.status).toBe(503);
    expect(await held?.json()).toEqual({ error: "unavailable" });
    expect(reencryptHoldResponse({})).toBeNull();
    expect(reencryptHoldResponse({ MAINTENANCE_MODE: "read_only" })).toBeNull();
    expect(reencryptHoldResponse({ OAUTH_REENCRYPT_MODE: "drain" })?.status).toBe(503);
  });

  it("drains the new cron without touching the database", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const handled = await runScheduledReencrypt({
      DB: {
        prepare() {
          throw new Error("database touched");
        },
        async batch() {
          throw new Error("database touched");
        },
      },
      OAUTH_REENCRYPT_MODE: "drain",
      SESSION_SECRET: currentSession,
    });

    expect(handled).toBe(true);
    expect(info).toHaveBeenCalledWith("oauth_reencrypt_drain", { writing: false });
    expect(JSON.stringify(info.mock.calls)).not.toContain(currentSession);
    info.mockRestore();
  });

  it("logs only counts from the scheduled one-shot and skips notification work", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const row = sealedRow("row-1");
    const handled = await runScheduledReencrypt({
      DB: {
        prepare() {
          return {
            bind() {
              return {
                async all() {
                  return {
                    results: [{
                      id: row.id,
                      access_token_ciphertext: row.accessTokenCiphertext,
                      refresh_token_ciphertext: row.refreshTokenCiphertext,
                    }],
                  };
                },
              };
            },
          };
        },
        async batch() {
          return undefined;
        },
      },
      MAINTENANCE_MODE: "read_only",
      OAUTH_REENCRYPT_MODE: "plan",
      OAUTH_REENCRYPT_DATABASE: "skill-compass-production",
      OAUTH_REENCRYPT_NEW_SECRET: newOAuth,
      SESSION_SECRET: currentSession,
    });

    expect(handled).toBe(true);
    expect(info).toHaveBeenCalledWith("oauth_reencrypt", expect.objectContaining({ ok: true, total: 1, written: 0 }));
    expect(JSON.stringify(info.mock.calls)).not.toContain(access);
    info.mockRestore();
  });
});

describe("production secret deploy guard", () => {
  it("can hold SESSION_SECRET writes and install the dedicated key without printing it", () => {
    const workflow = readFileSync(".github/workflows/deploy-production.yml", "utf8");
    expect(workflow).toContain("worker_secret_put=skipped");
    expect(workflow).toContain("secret_release=blocked");
    expect(workflow).toContain("vars.SESSION_SECRET_WRITE == 'release'");
    expect(workflow).not.toContain("session_secret_put=updated");
    expect(workflow).not.toContain("oauth_token_encryption_secret_put=updated");
    expect(workflow).not.toContain("echo \"$SESSION_SECRET\"");
    expect(workflow).not.toContain("echo \"$OAUTH_TOKEN_ENCRYPTION_SECRET\"");
    expect(workflow).toContain("vars.PRODUCTION_ROTATION_FREEZE == 'hold'");
    expect(workflow).toContain("terraform_apply=skipped");
    expect(workflow).toContain("wrangler_deploy=skipped");
    expect(workflow).not.toContain("\n  push:");
    const freezeAt = workflow.indexOf("production_rotation_freeze=hold");
    for (const marker of [
      "terraform -chdir=infra/cloudflare apply",
      "wrangler d1 execute",
      "scripts/interview/migrations.ts",
      "wrangler secret put",
      "wrangler secret bulk",
      "wrangler deploy",
    ]) {
      expect(freezeAt).toBeGreaterThan(0);
      expect(freezeAt).toBeLessThan(workflow.indexOf(marker));
    }
  });
});
