import { runOAuthReencrypt, type ReencryptDatabase, type ReencryptMode } from "@/lib/integrations/oauth-reencrypt";

export type ReencryptWorkerEnv = {
  DB: D1Like;
  MAINTENANCE_MODE?: string;
  OAUTH_REENCRYPT_MODE?: string;
  OAUTH_REENCRYPT_NONCE?: string;
  OAUTH_REENCRYPT_NEW_SECRET?: string;
  OAUTH_REENCRYPT_NEW_SESSION_SECRET?: string;
  OAUTH_TOKEN_ENCRYPTION_SECRET?: string;
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

export function reencryptMode(env: object): ReencryptMode | null {
  const mode = (env as { OAUTH_REENCRYPT_MODE?: unknown }).OAUTH_REENCRYPT_MODE;
  return typeof mode === "string" && modes.has(mode as ReencryptMode) ? mode as ReencryptMode : null;
}

export function reencryptHoldResponse(env: object): Response | null {
  if (!reencryptMode(env)) return null;
  return new Response(JSON.stringify({ error: "unavailable" }), {
    status: 503,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
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

export async function runScheduledReencrypt(env: ReencryptWorkerEnv): Promise<boolean> {
  const mode = reencryptMode(env);
  if (!mode) return false;
  try {
  const counts = await runOAuthReencrypt(d1ReencryptDatabase(env.DB), {
    mode,
    maintenanceReadOnly: env.MAINTENANCE_MODE === "read_only",
    currentOAuthSecret: env.OAUTH_TOKEN_ENCRYPTION_SECRET,
    currentSessionSecret: env.SESSION_SECRET ?? "",
    newOAuthSecret: env.OAUTH_REENCRYPT_NEW_SECRET ?? "",
    newSessionSecret: env.OAUTH_REENCRYPT_NEW_SESSION_SECRET,
    nonce: env.OAUTH_REENCRYPT_NONCE,
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
    });
  }
  return true;
}
