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
import { reencryptHoldResponse, runScheduledReencrypt } from "@/lib/integrations/oauth-reencrypt-worker";

const currentSession = "current-session-secret-32-characters";
const newOAuth = "new-oauth-encryption-secret-32ch";
const newSession = "replacement-session-secret-32-ch";
const access = "fake-access-token";
const refresh = "fake-refresh-token";

function database(initial: OAuthCipherRow[], failBatch = false): ReencryptDatabase & {
  rows: () => OAuthCipherRow[];
  batches: SqlStatement[][];
} {
  let rows = initial.map((row) => ({ ...row }));
  const backups = new Map<string, string>();
  const runs = new Set<string>();
  const batches: SqlStatement[][] = [];
  return {
    batches,
    rows: () => rows.map((row) => ({ ...row })),
    async query(sql, params = []) {
      if (sql.startsWith("SELECT nonce")) return (runs.has(String(params[0])) ? [{ nonce: params[0] }] : []) as never[];
      if (sql.startsWith("SELECT envelope")) {
        const envelope = backups.get(String(params[0]));
        return (envelope ? [{ envelope }] : []) as never[];
      }
      return rows.map((row) => ({
        id: row.id,
        access_token_ciphertext: row.accessTokenCiphertext,
        refresh_token_ciphertext: row.refreshTokenCiphertext,
      })) as never[];
    },
    async batch(statements) {
      batches.push(statements);
      if (failBatch) throw new Error("database rejected the batch");
      const snapshot = rows.map((row) => ({ ...row }));
      const savedBackups = new Map(backups);
      const savedRuns = new Set(runs);
      try {
        for (const statement of statements) apply(statement);
      } catch (error) {
        rows = snapshot;
        backups.clear();
        for (const [key, value] of savedBackups) backups.set(key, value);
        runs.clear();
        for (const run of savedRuns) runs.add(run);
        throw error;
      }
    },
  };

  function apply(statement: SqlStatement) {
    if (statement.sql.startsWith("CREATE")) return;
    if (statement.sql.startsWith("INSERT INTO oauth_reencrypt_runs")) {
      const nonce = String(statement.params[0]);
      if (runs.has(nonce)) throw new Error("constraint");
      runs.add(nonce);
      return;
    }
    if (statement.sql.startsWith("INSERT INTO oauth_reencrypt_backups")) {
      backups.set(String(statement.params[0]), String(statement.params[1]));
      return;
    }
    if (statement.sql.startsWith("UPDATE")) {
      const [accessTokenCiphertext, refreshTokenCiphertext, id] = statement.params;
      const row = rows.find((item) => item.id === id);
      if (!row) throw new Error("missing");
      row.accessTokenCiphertext = String(accessTokenCiphertext);
      row.refreshTokenCiphertext = refreshTokenCiphertext === null ? null : String(refreshTokenCiphertext);
    }
  }
}

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
    const applied = await runOAuthReencrypt(store, {
      mode: "apply",
      maintenanceReadOnly: true,
      currentSessionSecret: currentSession,
      newOAuthSecret: newOAuth,
      newSessionSecret: newSession,
      nonce: "nonce-0002",
    });
    const backup = store.batches[0]?.find((statement) => statement.sql.startsWith("INSERT INTO oauth_reencrypt_backups"));
    const envelope = String(backup?.params[1]);

    expect(applied).toMatchObject({ ok: true, total: 2, ready: 2, written: 2 });
    expect(store.batches).toHaveLength(1);
    expect(store.batches[0]?.filter((statement) => statement.sql.startsWith("UPDATE"))).toHaveLength(2);
    expect(openOAuthToken(store.rows()[0]!.accessTokenCiphertext, newOAuth)).toBe(access);
    expect(store.rows()[1]?.refreshTokenCiphertext).toBeNull();
    expect(envelope.includes(access)).toBe(false);
    expect(envelope.includes(refresh)).toBe(false);
    expect(openBackup(envelope, newOAuth)?.[0]?.accessTokenCiphertext).toBe(original[0]?.accessTokenCiphertext);

    const restored = await runOAuthReencrypt(store, {
      mode: "restore",
      maintenanceReadOnly: true,
      currentSessionSecret: currentSession,
      newOAuthSecret: newOAuth,
      nonce: "nonce-0002",
    });

    expect(restored.ok).toBe(true);
    expect(restored.restored).toBe(2);
    expect(store.rows()[0]?.accessTokenCiphertext).toBe(original[0]?.accessTokenCiphertext);
    expect(openOAuthToken(store.rows()[0]!.accessTokenCiphertext, currentSession)).toBe(access);
  });

  it("leaves the stored rows unchanged when the batch fails", async () => {
    const original = sealedRow("row-1");
    const store = database([original], true);
    const result = await runOAuthReencrypt(store, {
      mode: "apply",
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

  it("does not report a plan while writers are still allowed", async () => {
    const result = await runOAuthReencrypt(database([sealedRow("row-1")]), {
      mode: "plan",
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

describe("oauth reencrypt worker gate", () => {
  it("closes HTTP while a one-shot mode is armed and stays silent otherwise", async () => {
    const held = reencryptHoldResponse({ OAUTH_REENCRYPT_MODE: "plan" });
    expect(held?.status).toBe(503);
    expect(await held?.json()).toEqual({ error: "unavailable" });
    expect(reencryptHoldResponse({})).toBeNull();
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
    expect(workflow).toContain('if [ "$SESSION_SECRET_WRITE" = "hold" ]; then');
    expect(workflow).toContain("session_secret_put=skipped");
    expect(workflow).toContain("oauth_token_encryption_secret_put=absent");
    expect(workflow).not.toContain("echo \"$SESSION_SECRET\"");
    expect(workflow).not.toContain("echo \"$OAUTH_TOKEN_ENCRYPTION_SECRET\"");
  });
});
