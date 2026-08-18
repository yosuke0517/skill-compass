import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  buildMigrationSnapshot,
  decryptSnapshot,
  encryptSnapshot,
  migrationTableOrder,
} from "../../scripts/migration/types";
import { buildD1Batches, importD1 } from "../../scripts/migration/import-d1";
import { verifyMigration } from "../../scripts/migration/verify-migration";

const fixture = {
  users: [
    {
      id: "user_1",
      email: "private@example.com",
      password_hash: "scrypt$ciphertext",
      created_at: new Date("2026-08-01T00:00:00Z"),
    },
  ],
  sources: [{ id: "source_1", title: "Public source" }],
  concepts: [{ id: "concept_1", title: "Concept" }],
  questions: [{ id: "q_1", concept_id: "concept_1", source_id: "source_1" }],
  quiz_days: [{ id: "quiz_1", user_id: "user_1", quiz_date: new Date("2026-08-17T00:00:00Z") }],
  answers: [{ id: "answer_1", user_id: "user_1", quiz_day_id: "quiz_1", question_id: "q_1" }],
  oauth_connections: [
    { id: "oauth_1", user_id: "user_1", provider: "x", access_token_ciphertext: "cipher-a", refresh_token_ciphertext: "cipher-r" },
  ],
  podcast_episodes: [{ id: "episode_1", user_id: "user_1", title: "Episode" }],
  podcast_assets: [{ id: "asset_1", episode_id: "episode_1", storage_key: "podcast/user_1/one.mp3" }],
};

describe("deterministic MySQL to D1 migration", () => {
  it("covers every current application table exactly once", () => {
    const schema = readFileSync(path.join(process.cwd(), "src/db/mysql-schema.ts"), "utf8");
    const declared = [...schema.matchAll(/mysqlTable\(\s*["']([^"']+)["']/g)].map((match) => match[1]).sort();
    expect([...migrationTableOrder].sort()).toEqual(declared);
    expect(new Set(migrationTableOrder).size).toBe(migrationTableOrder.length);
  });

  it("encrypts the complete snapshot and restores ciphertext bytes exactly", () => {
    const snapshot = buildMigrationSnapshot(fixture, {
      createdAt: "2026-08-17T00:00:00.000Z",
      sourceSchema: "skill_compass",
    });
    const encrypted = encryptSnapshot(snapshot, "test-only migration passphrase", Buffer.alloc(16, 7), Buffer.alloc(12, 9));
    const serialized = encrypted.toString("utf8");

    expect(serialized).not.toContain("private@example.com");
    expect(serialized).not.toContain("cipher-r");
    expect(decryptSnapshot(encrypted, "test-only migration passphrase")).toEqual(snapshot);
  });

  it("uses stable dependency order, explicit values, and bounded idempotent batches", () => {
    const snapshot = buildMigrationSnapshot(fixture, {
      createdAt: "2026-08-17T00:00:00.000Z",
      sourceSchema: "skill_compass",
    });
    const batches = buildD1Batches(snapshot, 2);

    expect(migrationTableOrder.indexOf("users")).toBeLessThan(migrationTableOrder.indexOf("answers"));
    expect(batches.every((batch) => batch.length <= 2)).toBe(true);
    expect(batches.flat().every((query) => query.sql.startsWith("INSERT INTO"))).toBe(true);
    expect(batches.flat().every((query) => query.sql.includes("ON CONFLICT"))).toBe(true);
    expect(batches.flat().find((query) => query.sql.includes("`users`"))?.sql).toContain("DO UPDATE SET");
    expect(batches.flat().find((query) => query.sql.includes("`users`"))?.params).toContain(1_785_542_400);
  });

  it("produces the same D1 requests when the import is repeated", async () => {
    const snapshot = buildMigrationSnapshot(fixture, {
      createdAt: "2026-08-17T00:00:00.000Z",
      sourceSchema: "skill_compass",
    });
    const requests: string[] = [];
    const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) => {
      requests.push(String(init?.body));
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    };
    const input = { accountId: "account", databaseId: "staging", apiToken: "redacted", snapshot, fetchImpl: fetchImpl as typeof fetch };

    await importD1(input);
    const first = [...requests];
    requests.length = 0;
    await importD1(input);

    expect(requests).toEqual(first);
    expect(JSON.stringify(requests)).not.toContain("redacted");
  });

  it("replays safely against SQLite with foreign keys already present", () => {
    const snapshot = buildMigrationSnapshot(fixture, {
      createdAt: "2026-08-17T00:00:00.000Z",
      sourceSchema: "skill_compass",
    });
    const database = new DatabaseSync(":memory:");
    database.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, password_hash TEXT, created_at INTEGER);
      CREATE TABLE sources (id TEXT PRIMARY KEY, title TEXT);
      CREATE TABLE concepts (id TEXT PRIMARY KEY, title TEXT);
      CREATE TABLE questions (id TEXT PRIMARY KEY, concept_id TEXT REFERENCES concepts(id), source_id TEXT REFERENCES sources(id));
      CREATE TABLE quiz_days (id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), quiz_date INTEGER);
      CREATE TABLE answers (id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), quiz_day_id TEXT REFERENCES quiz_days(id), question_id TEXT REFERENCES questions(id));
      CREATE TABLE oauth_connections (id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), provider TEXT, access_token_ciphertext TEXT, refresh_token_ciphertext TEXT);
      CREATE TABLE podcast_episodes (id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), title TEXT);
      CREATE TABLE podcast_assets (id TEXT PRIMARY KEY, episode_id TEXT REFERENCES podcast_episodes(id), storage_key TEXT);
    `);
    const populatedTables = new Set(Object.entries(fixture).filter(([, rows]) => rows.length > 0).map(([table]) => table));
    const queries = buildD1Batches(snapshot).flat().filter((query) => [...populatedTables].some((table) => query.sql.includes(`\`${table}\``)));

    const sqliteParams = (query: (typeof queries)[number]) =>
      query.params.map((value) => typeof value === "boolean" ? Number(value) : value);
    for (const query of queries) database.prepare(query.sql).run(...sqliteParams(query));
    for (const query of queries) database.prepare(query.sql).run(...sqliteParams(query));

    expect(database.prepare("SELECT count(*) AS count FROM users").get()).toEqual({ count: 1 });
    expect(database.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    database.close();
  });

  it("verifies counts, primary keys, references, ciphertext, and R2 keys without printing values", () => {
    const source = buildMigrationSnapshot(fixture, {
      createdAt: "2026-08-17T00:00:00.000Z",
      sourceSchema: "skill_compass",
    });
    const success = verifyMigration(source, source);
    expect(success.ok).toBe(true);
    expect(success.failures).toEqual([]);

    const changed = structuredClone(source);
    changed.tables.oauth_connections.rows[0]!.refresh_token_ciphertext = "changed";
    const failure = verifyMigration(source, changed);
    expect(failure.ok).toBe(false);
    expect(JSON.stringify(failure)).not.toContain("cipher-r");
    expect(failure.failures).toContain("oauth_connections:checksum_mismatch");
  });

  it("detects dangling foreign references without including identifiers", () => {
    const source = buildMigrationSnapshot(fixture, {
      createdAt: "2026-08-17T00:00:00.000Z",
      sourceSchema: "skill_compass",
    });
    const target = structuredClone(source);
    target.tables.concepts.rows = [];
    target.tables.concepts.checksum = "empty";

    const report = verifyMigration(source, target);
    expect(report.failures).toContain("questions:concept_id:foreign_reference_missing");
    expect(JSON.stringify(report)).not.toContain("concept_1");
  });
});
