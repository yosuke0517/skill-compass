import { createCipheriv, createDecipheriv, createHash, scryptSync } from "node:crypto";

export type MigrationScalar = string | number | boolean | null;
export type MigrationRow = Record<string, MigrationScalar>;
export type MigrationTable = { primaryKey: string[]; rows: MigrationRow[]; checksum: string };
export type MigrationSnapshot = {
  version: 1;
  createdAt: string;
  sourceSchema: string;
  tables: Record<string, MigrationTable>;
};

export const migrationTableOrder = [
  "categories", "users", "entitlements", "sources", "mcp_oauth_clients", "export_runs", "job_runs",
  "tags", "translation_cache", "invites", "plan_entitlements", "user_entitlement_overrides", "audit_logs",
  "podcast_settings", "podcast_episodes", "concepts", "sessions", "oauth_connections", "x_public_post_cache",
  "x_daily_tech_digest_cache", "mcp_authorization_codes", "mcp_access_tokens", "mcp_refresh_tokens",
  "source_podcast_settings", "podcast_jobs", "podcast_assets", "concept_tags", "concept_sources", "questions",
  "quiz_days", "scores", "self_assessments", "podcast_audio_chunks", "podcast_chat_messages", "quiz_day_questions", "answers",
] as const;

export const primaryKeys: Record<string, string[]> = {
  categories: ["id"], users: ["id"], entitlements: ["id"], sources: ["id"], mcp_oauth_clients: ["id"],
  export_runs: ["id"], job_runs: ["id"], tags: ["id"], translation_cache: ["id"], invites: ["id"],
  plan_entitlements: ["plan_id", "entitlement_id"], user_entitlement_overrides: ["user_id", "entitlement_id"],
  audit_logs: ["id"], podcast_settings: ["user_id"], podcast_episodes: ["id"], concepts: ["id"], sessions: ["id"],
  oauth_connections: ["id"], x_public_post_cache: ["post_id"], x_daily_tech_digest_cache: ["user_id", "local_date"],
  mcp_authorization_codes: ["code_hash"], mcp_access_tokens: ["token_hash"], mcp_refresh_tokens: ["token_hash"],
  source_podcast_settings: ["user_id", "source_id"], podcast_jobs: ["id"], podcast_assets: ["id"],
  concept_tags: ["concept_id", "tag_id"], concept_sources: ["concept_id", "source_id"], questions: ["id"],
  quiz_days: ["id"], scores: ["id"], self_assessments: ["id"], podcast_audio_chunks: ["episode_id", "chunk_index"],
  podcast_chat_messages: ["id"], quiz_day_questions: ["quiz_day_id", "question_id"], answers: ["id"],
};

function normalize(value: unknown): MigrationScalar {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Math.floor(value.getTime() / 1_000);
  if (Buffer.isBuffer(value)) return `base64:${value.toString("base64")}`;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return JSON.stringify(value);
}

function canonical(rows: MigrationRow[]) {
  return JSON.stringify(rows, Object.keys(rows[0] ?? {}).sort());
}

export function tableChecksum(rows: MigrationRow[]) {
  return createHash("sha256").update(canonical(rows)).digest("hex");
}

export function buildMigrationSnapshot(
  input: Record<string, Array<Record<string, unknown>>>,
  metadata: { createdAt: string; sourceSchema: string },
): MigrationSnapshot {
  const tables: Record<string, MigrationTable> = {};
  for (const table of migrationTableOrder) {
    const key = primaryKeys[table];
    if (!key) throw new Error(`missing_primary_key:${table}`);
    const rows = (input[table] ?? []).map((row) =>
      Object.fromEntries(Object.entries(row).sort(([a], [b]) => a.localeCompare(b)).map(([column, value]) => [column, normalize(value)])),
    );
    rows.sort((a, b) => key.map((column) => String(a[column])).join("\0").localeCompare(key.map((column) => String(b[column])).join("\0")));
    tables[table] = { primaryKey: key, rows, checksum: tableChecksum(rows) };
  }
  return { version: 1, ...metadata, tables };
}

export function encryptSnapshot(snapshot: MigrationSnapshot, passphrase: string, salt?: Buffer, iv?: Buffer) {
  if (passphrase.length < 16) throw new Error("migration_passphrase_too_short");
  const actualSalt = salt ?? crypto.getRandomValues(new Uint8Array(16));
  const actualIv = iv ?? crypto.getRandomValues(new Uint8Array(12));
  const key = scryptSync(passphrase, actualSalt, 32);
  const cipher = createCipheriv("aes-256-gcm", key, actualIv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(snapshot)), cipher.final()]);
  return Buffer.from(JSON.stringify({ version: 1, kdf: "scrypt", cipher: "aes-256-gcm", salt: Buffer.from(actualSalt).toString("base64"), iv: Buffer.from(actualIv).toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") }));
}

export function decryptSnapshot(artifact: Buffer, passphrase: string): MigrationSnapshot {
  const envelope = JSON.parse(artifact.toString("utf8")) as Record<string, string | number>;
  if (envelope.version !== 1 || envelope.kdf !== "scrypt" || envelope.cipher !== "aes-256-gcm") throw new Error("unsupported_migration_artifact");
  const salt = Buffer.from(String(envelope.salt), "base64");
  const iv = Buffer.from(String(envelope.iv), "base64");
  const decipher = createDecipheriv("aes-256-gcm", scryptSync(passphrase, salt, 32), iv);
  decipher.setAuthTag(Buffer.from(String(envelope.tag), "base64"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(String(envelope.ciphertext), "base64")), decipher.final()]).toString("utf8")) as MigrationSnapshot;
}
