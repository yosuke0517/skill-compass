import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { oauthReencryptWriteStatements } from "@/lib/integrations/oauth-reencrypt";
import { sealOAuthToken } from "@/lib/integrations/oauth-tokens";

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
