import { InterviewError } from "./mock-service";
export interface Statement {
  bind(...values: (string | number | null)[]): Statement;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
}
export interface SqlDatabase {
  prepare(sql: string): Statement;
}
export type RelayRow = {
  id: string;
  owner: string;
  expires_at: number;
  heartbeat: number;
  generation: number;
  nonce: string | null;
  relay_until: number;
  hints: number;
  hint_limit: number;
  state: string;
  created_at: number;
  usage_mode: "standard" | "developer";
  save_learning: number;
};
export type Grant = {
  id: string;
  owner: string;
  generation: number;
  nonce: string;
  expiresAt: number;
  leaseUntil: number;
  mode: "mock" | "google";
  saveLearning?: boolean;
};
const fail = () =>
  new InterviewError(410, "利用枠・接続が失効しました。再接続条件を確認してください。");
export async function codeHash(code: string) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code))),
    (x) => x.toString(16).padStart(2, "0"),
  ).join("");
}
export function randomCode() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
}
/** Each mutation is a single SQL statement. The INSERT trigger reserves quota in the same transaction. */
export class RelayStore {
  constructor(
    private db: SqlDatabase,
    private now = Date.now,
  ) {}
  private async mutation<T>(operation: Promise<T>): Promise<T> {
    try {
      return await operation;
    } catch (error) {
      let current: unknown = error;
      for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
        if (current.message.includes("developer access or estimate budget exhausted"))
          throw new InterviewError(
            409,
            "開発者の利用権限または費用枠が不足しています。",
            "DEVELOPER_ACCESS_OR_BUDGET_EXHAUSTED",
          );
        current = current.cause;
      }
      throw error;
    }
  }
  async availability(owner: string) {
    const row = await this.db
      .prepare(
        `SELECT
      EXISTS(SELECT 1 FROM interview_relay_allowance WHERE id=1 AND duration_remaining>=300000 AND hints_remaining>=20) AS trial,
      EXISTS(SELECT 1 FROM interview_relay_allowance WHERE id=1 AND duration_remaining>=2400000 AND hints_remaining>=80) AS full,
      EXISTS(SELECT 1 FROM interview_relay_developers WHERE user_id=? AND enabled=1 AND budget_microusd>=15000) AS developer`,
      )
      .bind(owner)
      .first<{ trial: number; full: number; developer: number }>();
    return { trial: row?.trial === 1, full: row?.full === 1, developer: row?.developer === 1 };
  }
  async ticket(
    owner: string,
    duration: "trial" | "full" | "developer",
    id?: string,
    saveLearning = false,
  ) {
    const now = this.now(),
      code = randomCode(),
      hash = await codeHash(code);
    await this.db
      .prepare("DELETE FROM interview_relay_sessions WHERE expires_at < ?")
      .bind(now - 86_400_000)
      .run();
    let row: RelayRow | null;
    if (id) {
      row = await this.db
        .prepare(
          `UPDATE interview_relay_sessions SET code_hash=?, code_expires=?, generation=generation+1, nonce=NULL, ended_at=NULL,end_reason=NULL, heartbeat=?
        WHERE id=? AND owner=? AND state='active' AND expires_at>? AND relay_until<=? RETURNING *`,
        )
        .bind(hash, now + 30_000, now, id, owner, now, now)
        .first<RelayRow>();
    } else {
      const minutes = duration === "trial" ? 5 : 40,
        hints = duration === "trial" ? 20 : 80;
      try {
        row = await this.db
          .prepare(
            `INSERT INTO interview_relay_sessions
          (id,owner,created_at,expires_at,heartbeat,generation,code_hash,code_expires,hint_limit,usage_mode,charged_until,save_learning)
          VALUES (?,?,?,?,?,1,?,?,?,?,?,?) RETURNING *`,
          )
          .bind(
            crypto.randomUUID(),
            owner,
            now,
            now + minutes * 60_000,
            now,
            hash,
            now + 30_000,
            hints,
            duration === "developer" ? "developer" : "standard",
            now,
            saveLearning ? 1 : 0,
          )
          .first<RelayRow>();
      } catch (error) {
        // Only classify known trigger messages; never return raw SQL, credentials or user IDs.
        const messages: string[] = [];
        let cause: unknown = error;
        for (let depth = 0; depth < 4 && cause instanceof Error; depth++) {
          messages.push(cause.message);
          cause = cause.cause;
        }
        const message = messages.join("\n");
        if (/active session/.test(message))
          throw new InterviewError(
            409,
            "別の接続がまだ有効です。使用中の画面で停止するか、接続確認の期限が切れてから開始してください。",
            "ACTIVE_SESSION",
          );
        if (/allowance exhausted/.test(message))
          throw new InterviewError(
            409,
            `${duration === "trial" ? "5分試験" : "40分本番"}の通常利用枠が不足しています。開発者試験の許可がある場合は、停止して利用時間を選び直してください。`,
            "STANDARD_ALLOWANCE_EXHAUSTED",
          );
        if (/developer access or estimate budget unavailable/.test(message)) {
          const access = await this.db
            .prepare(
              "SELECT enabled,budget_microusd FROM interview_relay_developers WHERE user_id=?",
            )
            .bind(owner)
            .first<{ enabled: number; budget_microusd: number }>();
          if (!access || access.enabled !== 1)
            throw new InterviewError(
              409,
              "このアカウントには開発者試験の個別許可がありません。",
              "DEVELOPER_NOT_ALLOWED",
            );
          if (access.budget_microusd < 15000)
            throw new InterviewError(
              409,
              "開発者試験の費用目安枠が開始に必要な額を下回っています。",
              "DEVELOPER_BUDGET_EXHAUSTED",
            );
          throw new InterviewError(
            409,
            "開発者試験の許可または費用目安枠が開始時に変更されました。",
            "DEVELOPER_ACCESS_CHANGED",
          );
        }
        throw new InterviewError(
          503,
          "開始情報をデータベースに保存できませんでした。利用枠不足とは別のサーバーエラーです。",
          "START_DATABASE_ERROR",
        );
      }
    }
    if (!row) throw fail();
    return { id: row.id, ...this.details(row), ticket: code, ticketExpiresAt: now + 30_000 };
  }
  private details(row: RelayRow) {
    return {
      expiresAt: row.expires_at,
      startedAt: row.created_at,
      usageMode: row.usage_mode,
      hintAttempts: row.hints,
      hintLimit: row.usage_mode === "developer" ? null : row.hint_limit,
      saveLearning: row.save_learning === 1,
    };
  }
  async pulse(id: string, owner: string) {
    const row = await this.mutation(
      this.db
        .prepare(
          `UPDATE interview_relay_sessions SET heartbeat=? WHERE id=? AND owner=? AND state='active' AND expires_at>? RETURNING *`,
        )
        .bind(this.now(), id, owner, this.now())
        .first<RelayRow>(),
    );
    if (!row) throw fail();
    return this.details(row);
  }
  async stop(id: string, owner: string) {
    await this.db
      .prepare(
        `UPDATE interview_relay_sessions SET state='stopped',code_hash=NULL WHERE id=? AND owner=?`,
      )
      .bind(id, owner)
      .run();
    return { stopped: true };
  }
  async peek(code: string) {
    return this.db
      .prepare("SELECT * FROM interview_relay_sessions WHERE code_hash=?")
      .bind(await codeHash(code))
      .first<RelayRow>();
  }
  async get(id: string) {
    return this.db
      .prepare("SELECT * FROM interview_relay_sessions WHERE id=?")
      .bind(id)
      .first<RelayRow>();
  }
  async redeem(code: string, nonce: string) {
    const now = this.now();
    const row = await this.mutation(
      this.db
        .prepare(
          `UPDATE interview_relay_sessions SET code_hash=NULL,nonce=?,relay_until=MIN(expires_at,heartbeat+30000,?),charged_until=MAX(charged_until,MIN(expires_at,heartbeat+30000,?))
      WHERE code_hash=? AND code_expires>? AND state='active' AND expires_at>? AND heartbeat>? AND relay_until<=? RETURNING *`,
        )
        .bind(nonce, now + 30_000, now + 30_000, await codeHash(code), now, now, now - 30_000, now)
        .first<RelayRow>(),
    );
    if (!row) throw fail();
    return row;
  }
  async lease(id: string, generation: number, nonce: string, reserveHint = false) {
    const now = this.now();
    const row = await this.mutation(
      this.db
        .prepare(
          `UPDATE interview_relay_sessions SET relay_until=MIN(expires_at,heartbeat+30000,?),charged_until=MAX(charged_until,MIN(expires_at,heartbeat+30000,?))${reserveHint ? ",hints=hints+1,last_hint=?" : ""}
      WHERE id=? AND generation=? AND nonce=? AND state='active' AND expires_at>? AND heartbeat>? AND relay_until>?
      ${reserveHint ? "AND (usage_mode='developer' OR hints<hint_limit) AND last_hint<=?" : ""} RETURNING *`,
        )
        .bind(
          now + 30_000,
          ...(reserveHint ? [now + 30_000, now] : [now + 30_000]),
          id,
          generation,
          nonce,
          now,
          now - 30_000,
          now,
          ...(reserveHint ? [now - 2_500] : []),
        )
        .first<RelayRow>(),
    );
    if (!row) throw fail();
    return row;
  }
  async end(id: string, generation: number, nonce: string, reason: string) {
    await this.db
      .prepare(
        "UPDATE interview_relay_sessions SET relay_until=0,ended_at=COALESCE(ended_at,?),end_reason=COALESCE(end_reason,?) WHERE id=? AND generation=? AND nonce=?",
      )
      .bind(this.now(), reason, id, generation, nonce)
      .run();
    return { recorded: true };
  }
  async release(id: string, generation: number, nonce: string) {
    await this.db
      .prepare(
        "UPDATE interview_relay_sessions SET nonce=NULL,relay_until=0 WHERE id=? AND generation=? AND nonce=?",
      )
      .bind(id, generation, nonce)
      .run();
    return { released: true };
  }
}
