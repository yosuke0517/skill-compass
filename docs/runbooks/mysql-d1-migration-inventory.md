# MySQL to D1 migration inventory

This inventory is the safety baseline for the Skill Compass application migration. It records only table names, row counts, and implementation classifications. It must never contain row values, credentials, OAuth material, session values, password data, or encrypted payloads.

## Production snapshot

Captured read-only from the local production MySQL database on 2026-08-17.

- Application schema tables: 36
- MySQL migration metadata tables: 1
- Users: 2
- Today data: 24 quiz days, 160 assigned questions, 47 answers, 124 score rows
- Learning catalog: 12 categories, 36 tags, 76 concepts, 106 questions, 40 sources
- Podcast data: 6 episodes, 5 assets, 34 audio chunks, 12 chat messages, 6 jobs
- Connected-service state: 2 OAuth connections, 11 X daily digests, 3 public-post cache rows
- MCP authorization state: 2 clients, 9 authorization-code rows, 146 access-token rows, 144 refresh-token rows
- Other tables were counted as well; zero-row tables remain part of the migration schema.

Counts are operational metadata, not migration verification by themselves. The cutover tool must later compare exact counts, keys, references, ciphertext bytes, and R2 storage keys.

## Schema incompatibilities

The scanner currently finds 36 MySQL table declarations with these features:

| MySQL feature | Tables | D1 replacement |
| --- | ---: | --- |
| `mysqlEnum` | 7 | SQLite `text` columns plus application validation and database `CHECK` constraints where practical |
| JSON columns | 6 | Drizzle SQLite `text(..., { mode: "json" })`, preserving typed serialization |
| `timestamp` | 25 | One consistent integer Unix timestamp representation with application-level `Date` mapping |
| `datetime` | 14 | The same integer timestamp representation; nullable behavior is preserved |
| `date` | 5 | Integer Unix timestamps with existing `Date` mapping; tests preserve local-date normalization before storage |
| `onUpdateNow()` | 11 | Explicit `updatedAt` writes in each mutation; D1 has no MySQL automatic-update clause |
| Foreign keys | 25 | SQLite foreign keys with `PRAGMA foreign_keys = ON` in tests and D1 defaults verified |
| Composite primary keys | 8 | SQLite composite primary keys with the same column order |
| Secondary indexes | 15 | Equivalent SQLite indexes, reviewed against D1 query plans |
| Unique indexes | 7 | Equivalent SQLite unique indexes used as explicit conflict targets |

## Query incompatibilities

| Classification | Current sites | Replacement rule |
| --- | ---: | --- |
| MySQL upsert | 10 | `onConflictDoUpdate` or `onConflictDoNothing` with an explicit unique/primary-key target |
| Affected-row assumptions | 2 | `returning()` where supported, otherwise an immediate state assertion inside the same D1 batch/transaction boundary |
| Raw SQL | 3 | Replace MySQL expressions with SQLite equivalents; retain only parameterized Drizzle SQL fragments |
| Transactions | 3 | Use D1-compatible batches or transactions and test the atomic invariant directly |

The scanner reports exact source paths in memory when run. Paths are safe to log; source contents and query parameters are not.

## Required migration sequence

1. Freeze this inventory against the last MySQL schema used for export.
2. Generate and test the D1 schema on a disposable local D1 database.
3. Convert request queries and prove user scoping and idempotency with D1 fixtures.
4. Export MySQL in stable table/key order to an encrypted local artifact.
5. Import into staging D1 using explicit primary keys and bounded batches.
6. Verify counts, keys, references, latest Today progress, OAuth token families, ciphertext bytes, and R2 keys.
7. Repeat the import to prove idempotency before any production cutover.

MySQL and D1 must never be dual-written. Production remains on the Mac until the separately approved cutover procedure.
