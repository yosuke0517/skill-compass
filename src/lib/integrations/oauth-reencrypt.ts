import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { openOAuthToken, sealOAuthToken } from "@/lib/integrations/oauth-tokens";

export type OAuthCipherRow = {
  id: string;
  accessTokenCiphertext: string;
  refreshTokenCiphertext: string | null;
};

export type ReencryptCounts = {
  ok: boolean;
  total: number;
  ready: number;
  written: number;
  restored: number;
  already: boolean;
};

export type ReencryptMode = "plan" | "apply" | "restore";

export type ReencryptSecrets = {
  currentOAuthSecret?: string;
  currentSessionSecret: string;
  newOAuthSecret: string;
  newSessionSecret?: string;
};

export type SqlStatement = {
  sql: string;
  params: unknown[];
};

export type ReencryptDatabase = {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  batch(statements: SqlStatement[]): Promise<void>;
};

export type BackupSink = {
  put(nonce: string, envelope: string): Promise<void>;
  get(nonce: string): Promise<string | null>;
};

const noncePattern = /^[A-Za-z0-9_-]{8,64}$/;

export function reencryptCounts(partial: Partial<ReencryptCounts> = {}): ReencryptCounts {
  return {
    ok: false,
    total: 0,
    ready: 0,
    written: 0,
    restored: 0,
    already: false,
    ...partial,
  };
}

export function currentOAuthSecret(input: Pick<ReencryptSecrets, "currentOAuthSecret" | "currentSessionSecret">) {
  return input.currentOAuthSecret ?? input.currentSessionSecret;
}

export function validateReencryptSecrets(input: ReencryptSecrets, mode: ReencryptMode): ReencryptCounts | null {
  const current = currentOAuthSecret(input);
  if (current.length < 32 || input.newOAuthSecret.length < 32) return reencryptCounts();
  if (sameSecret(input.newOAuthSecret, current) || sameSecret(input.newOAuthSecret, input.currentSessionSecret)) {
    return reencryptCounts();
  }
  if (mode === "apply") {
    if (!input.newSessionSecret || input.newSessionSecret.length < 32) return reencryptCounts();
    if (
      sameSecret(input.newSessionSecret, input.currentSessionSecret) ||
      sameSecret(input.newSessionSecret, input.newOAuthSecret)
    ) {
      return reencryptCounts();
    }
  }
  return null;
}

export function prepareReencrypt(rows: OAuthCipherRow[], currentSecret: string, newSecret: string) {
  const next: OAuthCipherRow[] = [];
  let ready = 0;
  for (const row of rows) {
    const opened = openRow(row, currentSecret);
    if (!opened) {
      return { ok: false as const, rows: next, counts: reencryptCounts({ total: rows.length, ready }) };
    }
    const sealed = {
      id: row.id,
      accessTokenCiphertext: sealOAuthToken(opened.accessToken, newSecret),
      refreshTokenCiphertext: opened.refreshToken === null ? null : sealOAuthToken(opened.refreshToken, newSecret),
    };
    if (!samePlaintext(sealed, opened, newSecret)) {
      return { ok: false as const, rows: next, counts: reencryptCounts({ total: rows.length, ready }) };
    }
    next.push(sealed);
    ready += 1;
  }
  return { ok: true as const, rows: next, counts: reencryptCounts({ ok: true, total: rows.length, ready }) };
}

export function sealBackup(rows: OAuthCipherRow[], secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", backupKey(secret), iv);
  const body = Buffer.concat([
    cipher.update(JSON.stringify(rows.map(backupRow)), "utf8"),
    cipher.final(),
  ]);
  return `b1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${body.toString("base64url")}`;
}

export function openBackup(envelope: string, secret: string): OAuthCipherRow[] | null {
  const [version, encodedIv, encodedTag, encodedBody] = envelope.split(".");
  if (version !== "b1" || !encodedIv || !encodedTag || !encodedBody) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", backupKey(secret), Buffer.from(encodedIv, "base64url"));
    decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
    const parsed = JSON.parse(Buffer.concat([
      decipher.update(Buffer.from(encodedBody, "base64url")),
      decipher.final(),
    ]).toString("utf8")) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.map(readBackupRow);
  } catch {
    return null;
  }
}

export async function runOAuthReencrypt(
  db: ReencryptDatabase,
  input: ReencryptSecrets & {
    mode: ReencryptMode;
    nonce?: string;
    maintenanceReadOnly: boolean;
    databaseName?: string;
    backup?: BackupSink;
  },
): Promise<ReencryptCounts> {
  if (input.databaseName !== "skill-compass-production") return reencryptCounts();
  if (!input.maintenanceReadOnly) return reencryptCounts();
  const refused = validateReencryptSecrets(input, input.mode);
  if (refused) return refused;
  if ((input.mode === "apply" || input.mode === "restore") && !noncePattern.test(input.nonce ?? "")) {
    return reencryptCounts();
  }
  const current = currentOAuthSecret(input);
  const nonce = input.nonce ?? "";
  try {
    if (input.mode === "apply") {
      const prior = await appliedNonce(db, nonce);
      if (prior) {
        const existing = await listRows(db);
        return reencryptCounts({ ok: true, total: existing.length, ready: existing.length, already: true });
      }
    }
    const existing = await listRows(db);
    if (input.mode === "restore") {
      return restoreRows(db, existing, nonce, input.newOAuthSecret, current, input.backup);
    }
    const prepared = prepareReencrypt(existing, current, input.newOAuthSecret);
    if (!prepared.ok || input.mode === "plan") return prepared.counts;
    if (!input.backup) return reencryptCounts({ total: existing.length, ready: existing.length });
    const envelope = sealBackup(existing, input.newOAuthSecret);
    if (!openBackup(envelope, input.newOAuthSecret)) {
      return reencryptCounts({ total: existing.length, ready: existing.length });
    }
    await input.backup.put(nonce, envelope);
    try {
      await db.batch([
        { sql: createRunsSql, params: [] },
        { sql: createGuardsSql, params: [] },
        { sql: "INSERT INTO oauth_reencrypt_runs (nonce, mode, created_at) VALUES (?, 'applied', unixepoch())", params: [nonce] },
        ...prepared.rows.flatMap((row, index) => updateSql(row, existing[index]!)),
      ]);
    } catch {
      return reencryptCounts({ total: existing.length, ready: existing.length });
    }
    const written = await listRows(db);
    if (!sameStoredRows(written, prepared.rows) || !prepareReencrypt(written, input.newOAuthSecret, input.newOAuthSecret).ok) {
      const restored = await restoreRows(db, written, nonce, input.newOAuthSecret, current, input.backup);
      return reencryptCounts({ ...restored, ok: false, written: 0 });
    }
    return reencryptCounts({ ok: true, total: existing.length, ready: existing.length, written: prepared.rows.length });
  } catch {
    return reencryptCounts();
  }
}

async function appliedNonce(db: ReencryptDatabase, nonce: string) {
  const prior = await db.query<{ nonce: string }>(
    "SELECT nonce FROM oauth_reencrypt_runs WHERE nonce = ? AND mode = 'applied'",
    [nonce],
  ).catch(() => []);
  return prior.length > 0;
}

async function restoreRows(
  db: ReencryptDatabase,
  currentRows: OAuthCipherRow[],
  nonce: string,
  newSecret: string,
  currentSecret: string,
  backup?: BackupSink,
) {
  if (prepareReencrypt(currentRows, newSecret, newSecret).ok) {
    return reencryptCounts({
      ok: true,
      total: currentRows.length,
      ready: currentRows.length,
      already: true,
    });
  }
  const envelope = await backup?.get(nonce) ?? null;
  if (!envelope) return reencryptCounts({ total: currentRows.length });
  const previous = openBackup(envelope, newSecret);
  if (!previous || !prepareReencrypt(previous, currentSecret, currentSecret).ok) {
    return reencryptCounts({ total: currentRows.length });
  }
  try {
    await db.batch(previous.map((row) => ({
      sql: "UPDATE oauth_connections SET access_token_ciphertext = ?, refresh_token_ciphertext = ?, updated_at = unixepoch() WHERE id = ?",
      params: [row.accessTokenCiphertext, row.refreshTokenCiphertext, row.id],
    })));
  } catch {
    return reencryptCounts({ total: currentRows.length });
  }
  const restored = await listRows(db);
  const ok = sameStoredRows(restored, previous);
  return reencryptCounts({
    ok,
    total: previous.length,
    ready: ok ? previous.length : 0,
    restored: ok ? previous.length : 0,
  });
}

const createRunsSql = `CREATE TABLE IF NOT EXISTS oauth_reencrypt_runs (
  nonce TEXT PRIMARY KEY,
  mode TEXT NOT NULL,
  created_at INTEGER NOT NULL
)`;

const createGuardsSql = `CREATE TABLE IF NOT EXISTS oauth_reencrypt_guards (
  nonce TEXT NOT NULL,
  id TEXT NOT NULL,
  PRIMARY KEY (nonce, id)
)`;

async function listRows(db: ReencryptDatabase): Promise<OAuthCipherRow[]> {
  const rows = await db.query<{
    id: string;
    access_token_ciphertext: string;
    refresh_token_ciphertext: string | null;
  }>("SELECT id, access_token_ciphertext, refresh_token_ciphertext FROM oauth_connections");
  return rows.map((row) => ({
    id: row.id,
    accessTokenCiphertext: row.access_token_ciphertext,
    refreshTokenCiphertext: row.refresh_token_ciphertext,
  }));
}

function updateSql(next: OAuthCipherRow, previous: OAuthCipherRow): SqlStatement[] {
  return [
    {
      sql: "INSERT INTO oauth_reencrypt_guards (nonce, id) VALUES (?, ?)",
      params: ["row", next.id],
    },
    {
      sql: `UPDATE oauth_connections
        SET access_token_ciphertext = ?, refresh_token_ciphertext = ?, updated_at = unixepoch()
        WHERE id = ?
          AND access_token_ciphertext = ?
          AND ((? IS NULL AND refresh_token_ciphertext IS NULL) OR refresh_token_ciphertext = ?)`,
      params: [
        next.accessTokenCiphertext,
        next.refreshTokenCiphertext,
        next.id,
        previous.accessTokenCiphertext,
        previous.refreshTokenCiphertext,
        previous.refreshTokenCiphertext,
      ],
    },
    {
      sql: `INSERT INTO oauth_reencrypt_guards (nonce, id)
        SELECT ?, ?
        WHERE NOT EXISTS (
          SELECT 1 FROM oauth_connections
          WHERE id = ? AND access_token_ciphertext = ?
            AND ((? IS NULL AND refresh_token_ciphertext IS NULL) OR refresh_token_ciphertext = ?)
        )`,
      params: [
        "row",
        next.id,
        next.id,
        next.accessTokenCiphertext,
        next.refreshTokenCiphertext,
        next.refreshTokenCiphertext,
      ],
    },
  ];
}

function openRow(row: OAuthCipherRow, secret: string) {
  try {
    return {
      accessToken: openOAuthToken(row.accessTokenCiphertext, secret),
      refreshToken: row.refreshTokenCiphertext === null ? null : openOAuthToken(row.refreshTokenCiphertext, secret),
    };
  } catch {
    return null;
  }
}

function samePlaintext(
  row: OAuthCipherRow,
  opened: { accessToken: string; refreshToken: string | null },
  secret: string,
) {
  const again = openRow(row, secret);
  return again?.accessToken === opened.accessToken && again.refreshToken === opened.refreshToken;
}

function sameStoredRows(left: OAuthCipherRow[], right: OAuthCipherRow[]) {
  if (left.length !== right.length) return false;
  const byId = new Map(right.map((row) => [row.id, row]));
  return left.every((row) => {
    const other = byId.get(row.id);
    return other?.accessTokenCiphertext === row.accessTokenCiphertext
      && other.refreshTokenCiphertext === row.refreshTokenCiphertext;
  });
}

function backupRow(row: OAuthCipherRow) {
  return {
    id: row.id,
    accessTokenCiphertext: row.accessTokenCiphertext,
    refreshTokenCiphertext: row.refreshTokenCiphertext,
  };
}

function readBackupRow(value: unknown): OAuthCipherRow {
  if (!value || typeof value !== "object") throw new Error("oauth_backup_invalid");
  const row = value as Partial<OAuthCipherRow>;
  if (typeof row.id !== "string" || typeof row.accessTokenCiphertext !== "string") {
    throw new Error("oauth_backup_invalid");
  }
  if (row.refreshTokenCiphertext !== null && typeof row.refreshTokenCiphertext !== "string") {
    throw new Error("oauth_backup_invalid");
  }
  return {
    id: row.id,
    accessTokenCiphertext: row.accessTokenCiphertext,
    refreshTokenCiphertext: row.refreshTokenCiphertext ?? null,
  };
}

function backupKey(secret: string) {
  return createHash("sha256").update(`oauth-reencrypt-backup:${secret}`).digest();
}

function sameSecret(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
