import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { openOAuthToken, sealOAuthToken } from "@/lib/integrations/oauth-tokens";
import { oauthReencryptWriteStatements, runOAuthReencrypt, type ReencryptDatabase } from "@/lib/integrations/oauth-reencrypt";
import { runScheduledReencrypt } from "@/lib/integrations/oauth-reencrypt-worker";

const current = "current-session-secret-32-characters";
const replacement = "new-oauth-encryption-secret-32ch";

function memory() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE oauth_connections (
      id TEXT PRIMARY KEY,
      access_token_ciphertext TEXT NOT NULL,
      refresh_token_ciphertext TEXT,
      updated_at INTEGER
    );
    CREATE TABLE oauth_reencrypt_runs (
      nonce TEXT PRIMARY KEY,
      mode TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE oauth_reencrypt_guards (
      nonce TEXT NOT NULL,
      id TEXT NOT NULL,
      PRIMARY KEY (nonce, id)
    );
  `);
  return db;
}

function run(db: DatabaseSync, sql: string, params: unknown[]) {
  db.prepare(sql).run(...(params as Array<string | null>));
}

test("conditional update mismatch aborts and the transaction rolls back", () => {
  const db = memory();
  const original = sealOAuthToken("fake-access-token", current);
  const next = sealOAuthToken("fake-access-token", replacement);
  db.prepare(
    "INSERT INTO oauth_connections (id, access_token_ciphertext, refresh_token_ciphertext) VALUES (?, ?, ?)",
  ).run("row-1", original, null);
  db.prepare("UPDATE oauth_connections SET access_token_ciphertext = ? WHERE id = ?").run(
    "in-flight-writer",
    "row-1",
  );
  db.exec("BEGIN");
  const statements = oauthReencryptWriteStatements(
    { id: "row-1", accessTokenCiphertext: next, refreshTokenCiphertext: null },
    { id: "row-1", accessTokenCiphertext: original, refreshTokenCiphertext: null },
    "nonce-guard",
  );
  assert.throws(() => {
    for (const statement of statements) run(db, statement.sql, statement.params);
  });
  db.exec("ROLLBACK");
  const row = db.prepare("SELECT access_token_ciphertext FROM oauth_connections WHERE id = ?").get("row-1") as {
    access_token_ciphertext: string;
  };
  assert.equal(row.access_token_ciphertext, "in-flight-writer");
  assert.notEqual(row.access_token_ciphertext, next);
});

test("a second nonce insert rolls back and leaves the first ciphertext", () => {
  const db = memory();
  const original = sealOAuthToken("fake-access-token", current);
  const first = sealOAuthToken("fake-access-token", replacement);
  db.prepare(
    "INSERT INTO oauth_connections (id, access_token_ciphertext, refresh_token_ciphertext) VALUES (?, ?, NULL)",
  ).run("row-1", original);
  db.exec("BEGIN");
  db.prepare(
    "INSERT INTO oauth_reencrypt_runs (nonce, mode, created_at) VALUES (?, 'applied', unixepoch())",
  ).run("nonce-0007");
  db.prepare("UPDATE oauth_connections SET access_token_ciphertext = ? WHERE id = ?").run(first, "row-1");
  db.exec("COMMIT");

  db.exec("BEGIN");
  assert.throws(() => {
    db.prepare(
      "INSERT INTO oauth_reencrypt_runs (nonce, mode, created_at) VALUES (?, 'applied', unixepoch())",
    ).run("nonce-0007");
    db.prepare("UPDATE oauth_connections SET access_token_ciphertext = ? WHERE id = ?").run(
      "second-writer",
      "row-1",
    );
  });
  db.exec("ROLLBACK");
  const row = db.prepare("SELECT access_token_ciphertext FROM oauth_connections WHERE id = ?").get("row-1") as {
    access_token_ciphertext: string;
  };
  assert.equal(row.access_token_ciphertext, first);
});

function adapter(db: DatabaseSync): ReencryptDatabase {
  return {
    async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      return db.prepare(sql).all(...(params as never[])) as T[];
    },
    async batch(statements) {
      db.exec("BEGIN");
      try {
        for (const statement of statements) db.prepare(statement.sql).run(...(statement.params as never[]));
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

function corruptSecondRead(inner: ReencryptDatabase): ReencryptDatabase {
  let reads = 0;
  return {
    async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
      const rows = await inner.query<T>(sql, params);
      if (!sql.includes("oauth_connections")) return rows;
      reads += 1;
      if (reads !== 2) return rows;
      return rows.map((row) => ({ ...(row as object), access_token_ciphertext: "broken" })) as T[];
    },
    batch: (statements) => inner.batch(statements),
  };
}

function seed(db: DatabaseSync) {
  db.prepare(
    "INSERT INTO oauth_connections (id, access_token_ciphertext, refresh_token_ciphertext) VALUES (?, ?, NULL)",
  ).run("row-1", sealOAuthToken("fake-access-token", current));
}

function envelope() {
  const values = new Map<string, string>();
  return {
    async put(nonce: string, value: string) {
      values.set(nonce, value);
    },
    async get(nonce: string) {
      return values.get(nonce) ?? null;
    },
  };
}

function count(db: DatabaseSync, table: string) {
  return (db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;
}

test("restore after a failed verify clears the nonce so either nonce can apply again", async () => {
  const db = memory();
  seed(db);
  const backup = envelope();
  const failed = await runOAuthReencrypt(corruptSecondRead(adapter(db)), {
    mode: "apply",
    databaseName: "skill-compass-production",
    maintenanceReadOnly: true,
    backup,
    currentSessionSecret: current,
    newOAuthSecret: replacement,
    nonce: "nonce-aaa",
  });
  const stored = db.prepare("SELECT access_token_ciphertext FROM oauth_connections WHERE id = ?").get("row-1") as {
    access_token_ciphertext: string;
  };

  assert.equal(failed.ok, false);
  assert.equal(openOAuthToken(stored.access_token_ciphertext, current), "fake-access-token");
  assert.equal(count(db, "oauth_reencrypt_runs"), 0);
  assert.equal(count(db, "oauth_reencrypt_guards"), 0);

  const same = await runOAuthReencrypt(adapter(db), {
    mode: "apply",
    databaseName: "skill-compass-production",
    maintenanceReadOnly: true,
    backup,
    currentSessionSecret: current,
    newOAuthSecret: replacement,
    nonce: "nonce-aaa",
  });
  const afterSame = db.prepare("SELECT access_token_ciphertext FROM oauth_connections WHERE id = ?").get("row-1") as {
    access_token_ciphertext: string;
  };
  assert.equal(same.ok, true);
  assert.equal(same.already, false);
  assert.equal(openOAuthToken(afterSame.access_token_ciphertext, replacement), "fake-access-token");

  db.exec("DELETE FROM oauth_connections");
  db.exec("DELETE FROM oauth_reencrypt_runs");
  db.exec("DELETE FROM oauth_reencrypt_guards");
  seed(db);
  await runOAuthReencrypt(corruptSecondRead(adapter(db)), {
    mode: "apply",
    databaseName: "skill-compass-production",
    maintenanceReadOnly: true,
    backup: envelope(),
    currentSessionSecret: current,
    newOAuthSecret: replacement,
    nonce: "nonce-aaa",
  });
  const other = await runOAuthReencrypt(adapter(db), {
    mode: "apply",
    databaseName: "skill-compass-production",
    maintenanceReadOnly: true,
    backup: envelope(),
    currentSessionSecret: current,
    newOAuthSecret: replacement,
    nonce: "nonce-bbb",
  });
  const afterOther = db.prepare("SELECT access_token_ciphertext FROM oauth_connections WHERE id = ?").get("row-1") as {
    access_token_ciphertext: string;
  };
  assert.equal(other.ok, true);
  assert.equal(openOAuthToken(afterOther.access_token_ciphertext, replacement), "fake-access-token");
});

test("a completed apply stays applied and restore does not rewrite it", async () => {
  const db = memory();
  seed(db);
  const input = {
    databaseName: "skill-compass-production",
    maintenanceReadOnly: true,
    backup: envelope(),
    currentSessionSecret: current,
    newOAuthSecret: replacement,
    nonce: "nonce-done",
  } as const;
  const applied = await runOAuthReencrypt(adapter(db), { mode: "apply", ...input });
  const again = await runOAuthReencrypt(adapter(db), { mode: "apply", ...input });
  const restored = await runOAuthReencrypt(adapter(db), { mode: "restore", ...input });
  const row = db.prepare("SELECT access_token_ciphertext FROM oauth_connections WHERE id = ?").get("row-1") as {
    access_token_ciphertext: string;
  };

  assert.equal(applied.ok, true);
  assert.equal(again.already, true);
  assert.equal(again.written, 0);
  assert.equal(restored.already, true);
  assert.equal(restored.restored, 0);
  assert.equal(openOAuthToken(row.access_token_ciphertext, replacement), "fake-access-token");
});

test("the dedicated binding migrates every row without the alias secret", async () => {
  const db = memory();
  seed(db);
  db.prepare(
    "INSERT INTO oauth_connections (id, access_token_ciphertext, refresh_token_ciphertext) VALUES (?, ?, NULL)",
  ).run("row-2", sealOAuthToken("second-token", current));
  const handled = await runScheduledReencrypt({
    DB: {
      prepare(sql: string) {
        return {
          bind(...params: unknown[]) {
            return {
              sql,
              params,
              async all() {
                return { results: db.prepare(sql).all(...(params as never[])) };
              },
            };
          },
        };
      },
      async batch(statements: Array<{ sql: string; params: unknown[] }>) {
        db.exec("BEGIN");
        try {
          for (const statement of statements) db.prepare(statement.sql).run(...(statement.params as never[]));
          db.exec("COMMIT");
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      },
    },
    MAINTENANCE_MODE: "read_only",
    OAUTH_REENCRYPT_MODE: "apply",
    OAUTH_REENCRYPT_NONCE: "nonce-binding",
    OAUTH_REENCRYPT_DATABASE: "skill-compass-production",
    SESSION_SECRET: current,
    OAUTH_TOKEN_ENCRYPTION_SECRET: replacement,
  });
  const rows = db.prepare("SELECT id, access_token_ciphertext FROM oauth_connections ORDER BY id").all() as Array<{
    id: string;
    access_token_ciphertext: string;
  }>;

  assert.equal(handled, true);
  assert.deepEqual(rows.map((row) => row.id), ["row-1", "row-2"]);
  assert.deepEqual(rows.map((row) => openOAuthToken(row.access_token_ciphertext, replacement)), [
    "fake-access-token",
    "second-token",
  ]);
});
