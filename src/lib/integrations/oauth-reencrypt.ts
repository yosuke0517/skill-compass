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
  stopped: boolean;
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
    stopped: false,
    ...partial,
  };
}

export function currentOAuthSecret(input: Pick<ReencryptSecrets, "currentOAuthSecret" | "currentSessionSecret">) {
  return input.currentOAuthSecret ?? input.currentSessionSecret;
}

export function validateReencryptSecrets(input: ReencryptSecrets): ReencryptCounts | null {
  const current = currentOAuthSecret(input);
  if (current.length < 32 || input.newOAuthSecret.length < 32) return reencryptCounts();
  if (sameSecret(input.newOAuthSecret, current) || sameSecret(input.newOAuthSecret, input.currentSessionSecret)) {
    return reencryptCounts();
  }
  if (
    input.newSessionSecret !== undefined &&
    (input.newSessionSecret.length < 32 ||
      sameSecret(input.newSessionSecret, input.currentSessionSecret) ||
      sameSecret(input.newSessionSecret, input.newOAuthSecret))
  ) {
    return reencryptCounts();
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
  const refused = validateReencryptSecrets(input);
  if (refused) return refused;
  if ((input.mode === "apply" || input.mode === "restore") && !noncePattern.test(input.nonce ?? "")) {
    return reencryptCounts();
  }
  const current = currentOAuthSecret(input);
  const nonce = input.nonce ?? "";
  try {
    // A stopped nonce never reads or writes OAuth rows again. A new attempt needs a different nonce.
    const state = input.mode === "plan" ? null : await nonceMode(db, nonce);
    if (state === "stopped") return reencryptCounts({ stopped: true });
    if (state === "restoring") {
      const recorded = await listRows(db);
      const restored = await restoreRows(db, recorded, nonce, input.newOAuthSecret, current, input.backup);
      return reencryptCounts({ ...restored, ok: false });
    }
    if (state?.startsWith("checking:")) {
      const recorded = await listRows(db);
      return await verifyApply(db, recorded, state, input, nonce, current);
    }
    if (input.mode === "apply" && state === "applied") {
      const recorded = await listRows(db);
      if (prepareReencrypt(recorded, input.newOAuthSecret, input.newOAuthSecret).ok) {
        return reencryptCounts({ ok: true, total: recorded.length, ready: recorded.length, already: true });
      }
      return reencryptCounts({ ok: false, total: recorded.length });
    }
    const existing = await listRows(db);
    if (input.mode === "restore") {
      if (prepareReencrypt(existing, input.newOAuthSecret, input.newOAuthSecret).ok) {
        return reencryptCounts({ ok: true, total: existing.length, ready: existing.length, already: true });
      }
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
    const checking = checkingState(prepared.rows);
    try {
      await db.batch([
        { sql: createRunsSql, params: [] },
        { sql: createGuardsSql, params: [] },
        { sql: "INSERT INTO oauth_reencrypt_runs (nonce, mode, created_at) VALUES (?, ?, unixepoch())", params: [nonce, checking] },
        ...prepared.rows.flatMap((row, index) => updateSql(row, existing[index]!, nonce)),
      ]);
    } catch {
      return reencryptCounts({ total: existing.length, ready: existing.length });
    }
    const written = await listRows(db);
    return await verifyApply(db, written, checking, input, nonce, current);
  } catch {
    return reencryptCounts();
  }
}

// listRows uses ORDER BY id. Persist the expected result in the same transaction
// as the rewrite so an interrupted tick can verify the exact ciphertext again.
function checkingState(rows: OAuthCipherRow[]) {
  return "checking:" + createHash("sha256").update(JSON.stringify(rows.map(backupRow))).digest("hex");
}

async function verifyApply(db: ReencryptDatabase, rows: OAuthCipherRow[], checking: string,
  input: { newOAuthSecret: string; backup?: BackupSink }, nonce: string, current: string) {
  if (checkingState(rows) !== checking || !prepareReencrypt(rows, input.newOAuthSecret, input.newOAuthSecret).ok) {
    await db.batch([{ sql: "UPDATE oauth_reencrypt_runs SET mode = 'restoring' WHERE nonce = ? AND mode = ?", params: [nonce, checking] }]);
    if (await nonceMode(db, nonce) !== "restoring") return reencryptCounts({ total: rows.length });
    const restored = await restoreRows(db, rows, nonce, input.newOAuthSecret, current, input.backup);
    return reencryptCounts({ ...restored, ok: false, written: 0 });
  }
  await db.batch([{ sql: "UPDATE oauth_reencrypt_runs SET mode = 'applied' WHERE nonce = ? AND mode = ?", params: [nonce, checking] }]);
  if (await nonceMode(db, nonce) !== "applied") return reencryptCounts({ total: rows.length });
  return reencryptCounts({ ok: true, total: rows.length, ready: rows.length, written: rows.length });
}

async function nonceMode(db: ReencryptDatabase, nonce: string) {
  const prior = await db.query<{ mode: string }>(
    "SELECT mode FROM oauth_reencrypt_runs WHERE nonce = ?",
    [nonce],
  ).catch(() => []);
  return prior[0]?.mode ?? null;
}

async function restoreRows(
  db: ReencryptDatabase,
  currentRows: OAuthCipherRow[],
  nonce: string,
  newSecret: string,
  currentSecret: string,
  backup?: BackupSink,
) {
  const envelope = await backup?.get(nonce) ?? null;
  if (!envelope) return reencryptCounts({ total: currentRows.length });
  const previous = openBackup(envelope, newSecret);
  if (!previous || !prepareReencrypt(previous, currentSecret, currentSecret).ok) {
    return reencryptCounts({ total: currentRows.length });
  }
  const ids = new Set(currentRows.map(row => row.id));
  if (previous.length !== ids.size || previous.some(row => !ids.has(row.id))) {
    return reencryptCounts({ total: currentRows.length });
  }
  try {
    await db.batch([
      ...previous.map((row) => ({
        sql: "UPDATE oauth_connections SET access_token_ciphertext = ?, refresh_token_ciphertext = ?, updated_at = unixepoch() WHERE id = ?",
        params: [row.accessTokenCiphertext, row.refreshTokenCiphertext, row.id],
      })),
      { sql: "DELETE FROM oauth_reencrypt_guards WHERE nonce = ?", params: [nonce] },
      {
        sql: "UPDATE oauth_reencrypt_runs SET mode = 'stopped' WHERE nonce = ? AND mode IN ('applied', 'restoring')",
        params: [nonce],
      },
    ]);
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
  }>("SELECT id, access_token_ciphertext, refresh_token_ciphertext FROM oauth_connections ORDER BY id");
  return rows.map((row) => ({
    id: row.id,
    accessTokenCiphertext: row.access_token_ciphertext,
    refreshTokenCiphertext: row.refresh_token_ciphertext,
  }));
}

export function oauthReencryptWriteStatements(next: OAuthCipherRow, previous: OAuthCipherRow, nonce: string) {
  return updateSql(next, previous, nonce);
}

function updateSql(next: OAuthCipherRow, previous: OAuthCipherRow, nonce: string): SqlStatement[] {
  return [
    {
      sql: "INSERT INTO oauth_reencrypt_guards (nonce, id) VALUES (?, ?)",
      params: [nonce, next.id],
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
        nonce,
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
