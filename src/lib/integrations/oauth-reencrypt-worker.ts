import { timingSafeEqual } from "node:crypto";

import { runOAuthReencrypt, type ReencryptDatabase, type ReencryptMode } from "@/lib/integrations/oauth-reencrypt";

export type ReencryptWorkerEnv = {
  DB: D1Like;
  MAINTENANCE_MODE?: string;
  OAUTH_REENCRYPT_MODE?: string;
  OAUTH_REENCRYPT_NONCE?: string;
  OAUTH_REENCRYPT_NEW_SECRET?: string;
  OAUTH_TOKEN_ENCRYPTION_SECRET?: string;
  OAUTH_REENCRYPT_DATABASE?: string;
  OAUTH_REENCRYPT_BACKUP_DB?: D1Like;
  SESSION_SECRET?: string;
};

type D1Like = {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      all(): Promise<{ results?: unknown[] }>;
    };
  };
  batch(statements: unknown[]): Promise<unknown>;
};

const modes = new Set<ReencryptMode>(["plan", "apply", "restore"]);
const holdModes = new Set<string>(["plan", "apply", "restore", "drain"]);

export function reencryptMode(env: object): ReencryptMode | null {
  const mode = (env as { OAUTH_REENCRYPT_MODE?: unknown }).OAUTH_REENCRYPT_MODE;
  return typeof mode === "string" && modes.has(mode as ReencryptMode) ? mode as ReencryptMode : null;
}

export function reencryptHoldResponse(env: object): Response | null {
  const mode = (env as { OAUTH_REENCRYPT_MODE?: unknown }).OAUTH_REENCRYPT_MODE;
  if (typeof mode !== "string" || !holdModes.has(mode)) return null;
  return new Response(JSON.stringify({ error: "unavailable" }), {
    status: 503,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export function d1BackupSink(db: D1Like) {
  return {
    async put(nonce: string, envelope: string) {
      await db.batch([
        db.prepare(`CREATE TABLE IF NOT EXISTS oauth_reencrypt_backups (
          nonce TEXT PRIMARY KEY,
          envelope TEXT NOT NULL,
          created_at INTEGER NOT NULL
        )`).bind(),
        db.prepare(
          `INSERT INTO oauth_reencrypt_backups (nonce, envelope, created_at) VALUES (?, ?, unixepoch())
           ON CONFLICT(nonce) DO UPDATE SET envelope = excluded.envelope, created_at = excluded.created_at`,
        ).bind(nonce, envelope),
      ]);
    },
    async get(nonce: string) {
      const { results } = await db.prepare(
        "SELECT envelope FROM oauth_reencrypt_backups WHERE nonce = ?",
      ).bind(nonce).all();
      const row = results?.[0] as { envelope?: unknown } | undefined;
      return typeof row?.envelope === "string" ? row.envelope : null;
    },
  };
}

export function d1ReencryptDatabase(db: D1Like): ReencryptDatabase {
  return {
    async query(sql, params = []) {
      const { results } = await db.prepare(sql).bind(...params).all();
      return (results ?? []) as never[];
    },
    async batch(statements) {
      await db.batch(statements.map((statement) => db.prepare(statement.sql).bind(...statement.params)));
    },
  };
}

export function reencryptSecretsFromBindings(env: ReencryptWorkerEnv) {
  const dedicated = env.OAUTH_TOKEN_ENCRYPTION_SECRET ?? "";
  const alias = env.OAUTH_REENCRYPT_NEW_SECRET ?? "";
  if (dedicated && alias && !sameBinding(dedicated, alias)) return null;
  const newOAuthSecret = dedicated || alias;
  if (!newOAuthSecret) return null;
  return {
    currentSessionSecret: env.SESSION_SECRET ?? "",
    newOAuthSecret,
  };
}

function sameBinding(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function runScheduledReencrypt(env: ReencryptWorkerEnv): Promise<boolean> {
  if (env.OAUTH_REENCRYPT_MODE === "drain") {
    console.info("oauth_reencrypt_drain", { writing: false });
    return true;
  }
  const mode = reencryptMode(env);
  if (!mode) return false;
  const secrets = reencryptSecretsFromBindings(env);
  if (!secrets) {
    console.info("oauth_reencrypt", {
      ok: false,
      total: 0,
      ready: 0,
      written: 0,
      restored: 0,
      already: false,
      stopped: false,
    });
    return true;
  }
  try {
  const counts = await runOAuthReencrypt(d1ReencryptDatabase(env.DB), {
    mode,
    maintenanceReadOnly: env.MAINTENANCE_MODE === "read_only",
    databaseName: env.OAUTH_REENCRYPT_DATABASE,
    currentSessionSecret: secrets.currentSessionSecret,
    newOAuthSecret: secrets.newOAuthSecret,
    nonce: env.OAUTH_REENCRYPT_NONCE,
    backup: d1BackupSink(env.OAUTH_REENCRYPT_BACKUP_DB ?? env.DB),
  });
  console.info("oauth_reencrypt", counts);
  } catch {
    console.info("oauth_reencrypt", {
      ok: false,
      total: 0,
      ready: 0,
      written: 0,
      restored: 0,
      already: false,
      stopped: false,
    });
  }
  return true;
}
