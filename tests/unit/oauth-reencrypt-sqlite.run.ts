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

function counting(inner: ReencryptDatabase) {
  let oauthReads = 0;
  return {
    db: {
      async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
        if (sql.includes("oauth_connections")) oauthReads += 1;
        return inner.query<T>(sql, params);
      },
      batch: (statements: Parameters<ReencryptDatabase["batch"]>[0]) => inner.batch(statements),
    },
    reads: () => oauthReads,
  };
}

function runMode(db: DatabaseSync, nonce: string) {
  return (db.prepare("SELECT mode FROM oauth_reencrypt_runs WHERE nonce = ?").get(nonce) as { mode: string } | undefined)?.mode;
}

test("a substituted but decryptable ciphertext restores the exact original and stops future ticks", async () => {
  const db = memory();
  try {
    seed(db);
    const read = () => db.prepare("SELECT access_token_ciphertext FROM oauth_connections").get()?.access_token_ciphertext;
    const original = read();
    const inner = adapter(db);
    const input = {
      mode: "apply" as const, nonce: "nonce-substituted", databaseName: "skill-compass-production",
      maintenanceReadOnly: true, backup: envelope(), currentSessionSecret: current, newOAuthSecret: replacement,
    };
    const changed: ReencryptDatabase = {
      query: inner.query,
      async batch(statements) {
        await inner.batch(statements);
        if (statements.some(s => s.sql.startsWith("INSERT INTO oauth_reencrypt_runs"))) {
          db.prepare("UPDATE oauth_connections SET access_token_ciphertext = ?").run(sealOAuthToken("different", replacement));
        }
      },
    };
    const result = await runOAuthReencrypt(changed, input);
    assert.equal(result.ok, false);
    assert.equal(result.restored, 1);
    assert.equal(read(), original);
    assert.equal(runMode(db, input.nonce), "stopped");
    const watched = counting(inner);
    for (let i = 0; i < 3; i++) assert.equal((await runOAuthReencrypt(watched.db, input)).stopped, true);
    assert.equal(watched.reads(), 0);
  } finally { db.close(); }
});

test("a failed verify stops that nonce and later ticks do not read or write OAuth rows", async () => {
  const db = memory();
  seed(db);
  const backup = envelope();
  const input = {
    databaseName: "skill-compass-production",
    maintenanceReadOnly: true,
    backup,
    currentSessionSecret: current,
    newOAuthSecret: replacement,
    nonce: "nonce-aaa",
  } as const;
  const failed = await runOAuthReencrypt(corruptSecondRead(adapter(db)), { mode: "apply", ...input });
  const stored = db.prepare("SELECT access_token_ciphertext FROM oauth_connections WHERE id = ?").get("row-1") as {
    access_token_ciphertext: string;
  };
  const watched = counting(adapter(db));

  assert.equal(failed.ok, false);
  assert.equal(failed.stopped, false);
  assert.equal(openOAuthToken(stored.access_token_ciphertext, current), "fake-access-token");
  assert.equal(runMode(db, "nonce-aaa"), "stopped");

  for (let tick = 0; tick < 3; tick += 1) {
    const again = await runOAuthReencrypt(watched.db, { mode: "apply", ...input });
    assert.equal(again.stopped, true);
    assert.equal(again.written, 0);
  }
  const restoredMode = await runOAuthReencrypt(watched.db, { mode: "restore", ...input });
  const after = db.prepare("SELECT access_token_ciphertext FROM oauth_connections WHERE id = ?").get("row-1") as {
    access_token_ciphertext: string;
  };

  assert.equal(restoredMode.stopped, true);
  assert.equal(watched.reads(), 0);
  assert.equal(openOAuthToken(after.access_token_ciphertext, current), "fake-access-token");
  assert.equal(runMode(db, "nonce-aaa"), "stopped");

  const other = await runOAuthReencrypt(adapter(db), { ...input, mode: "apply", nonce: "nonce-bbb" });
  const moved = db.prepare("SELECT access_token_ciphertext FROM oauth_connections WHERE id = ?").get("row-1") as {
    access_token_ciphertext: string;
  };
  assert.equal(other.ok, true);
  assert.equal(other.stopped, false);
  assert.equal(openOAuthToken(moved.access_token_ciphertext, replacement), "fake-access-token");
  assert.equal(runMode(db, "nonce-aaa"), "stopped");
  assert.equal(runMode(db, "nonce-bbb"), "applied");
});

test("an interrupted apply verifies the committed ciphertext before accepting a retry", async () => {
  for (const substitute of [false, true]) {
    const db = memory();
    try {
      seed(db);
      const inner = adapter(db);
      const nonce = "nonce-interrupt";
      const input = { mode: "apply" as const, databaseName: "skill-compass-production",
        maintenanceReadOnly: true, currentSessionSecret: current, newOAuthSecret: replacement, backup: envelope(), nonce };
      const interrupted: ReencryptDatabase = {
        query: inner.query,
        async batch(statements) {
          await inner.batch(statements);
          throw new Error("lost acknowledgement after commit");
        },
      };
      assert.equal((await runOAuthReencrypt(interrupted, input)).ok, false);
      assert.match(runMode(db, nonce) ?? "", /^checking:/);
      if (substitute) db.prepare("UPDATE oauth_connections SET access_token_ciphertext = ?").run(sealOAuthToken("other", replacement));
      const resumed = await runOAuthReencrypt(inner, input);
      assert.equal(resumed.ok, !substitute);
      assert.equal(runMode(db, nonce), substitute ? "stopped" : "applied");
      const value = db.prepare("SELECT access_token_ciphertext FROM oauth_connections").get()?.access_token_ciphertext;
      assert.equal(openOAuthToken(String(value), substitute ? current : replacement), "fake-access-token");
    } finally { db.close(); }
  }
});

test("an existing stopped nonce is not cleared or retried", async () => {
  const db = memory();
  seed(db);
  db.prepare("INSERT INTO oauth_reencrypt_runs (nonce, mode, created_at) VALUES (?, 'stopped', 0)").run("nonce-stop");
  const watched = counting(adapter(db));
  const input = {
    mode: "apply" as const,
    databaseName: "skill-compass-production",
    maintenanceReadOnly: true,
    backup: envelope(),
    currentSessionSecret: current,
    newOAuthSecret: replacement,
    nonce: "nonce-stop",
  };
  const stopped = await runOAuthReencrypt(watched.db, input);
  const restore = await runOAuthReencrypt(watched.db, { ...input, mode: "restore" });

  assert.equal(stopped.stopped, true);
  assert.equal(restore.stopped, true);
  assert.equal(watched.reads(), 0);
  assert.equal(runMode(db, "nonce-stop"), "stopped");
  assert.equal(
    openOAuthToken(
      (db.prepare("SELECT access_token_ciphertext FROM oauth_connections WHERE id = ?").get("row-1") as {
        access_token_ciphertext: string;
      }).access_token_ciphertext,
      current,
    ),
    "fake-access-token",
  );
});

test("a failed restore retries restoration even when the next read decrypts with the new key", async () => {
  const db = memory();
  try {
    seed(db);
    const inner = adapter(db);
    const saved = envelope();
    let available = false;
    const input = { mode: "apply" as const, databaseName: "skill-compass-production",
      maintenanceReadOnly: true, currentSessionSecret: current, newOAuthSecret: replacement, nonce: "nonce-recover",
      backup: { put: saved.put, get: (nonce: string) => available ? saved.get(nonce) : Promise.resolve(null) } };
    assert.equal((await runOAuthReencrypt(corruptSecondRead(inner), input)).ok, false);
    assert.equal(runMode(db, input.nonce), "restoring");
    available = true;
    assert.equal((await runOAuthReencrypt(inner, input)).restored, 1);
    assert.equal(runMode(db, input.nonce), "stopped");
  } finally { db.close(); }
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
  assert.equal(again.stopped, false);
  assert.equal(again.written, 0);
  assert.equal(restored.already, true);
  assert.equal(runMode(db, "nonce-done"), "applied");
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
