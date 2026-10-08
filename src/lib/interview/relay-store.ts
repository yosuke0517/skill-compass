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
};
export type Grant = {
  id: string;
  owner: string;
  generation: number;
  nonce: string;
  expiresAt: number;
  leaseUntil: number;
  mode: "mock" | "google";
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
  async ticket(owner: string, duration: "trial" | "full", id?: string) {
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
          `UPDATE interview_relay_sessions SET code_hash=?, code_expires=?, generation=generation+1, nonce=NULL, heartbeat=?
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
          (id,owner,created_at,expires_at,heartbeat,generation,code_hash,code_expires,hint_limit)
          VALUES (?,?,?,?,?,1,?,?,?) RETURNING *`,
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
          )
          .first<RelayRow>();
      } catch {
        throw new InterviewError(
          409,
          "利用枠が未設定・消費済み、または接続が残っています。開始を繰り返さず確認してください。",
        );
      }
    }
    if (!row) throw fail();
    return { id: row.id, expiresAt: row.expires_at, ticket: code, ticketExpiresAt: now + 30_000 };
  }
  async pulse(id: string, owner: string) {
    const row = await this.db
      .prepare(
        `UPDATE interview_relay_sessions SET heartbeat=? WHERE id=? AND owner=? AND state='active' AND expires_at>? RETURNING *`,
      )
      .bind(this.now(), id, owner, this.now())
      .first<RelayRow>();
    if (!row) throw fail();
    return { expiresAt: row.expires_at };
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
    const row = await this.db
      .prepare(
        `UPDATE interview_relay_sessions SET code_hash=NULL,nonce=?,relay_until=MIN(expires_at,heartbeat+30000,?)
      WHERE code_hash=? AND code_expires>? AND state='active' AND expires_at>? AND heartbeat>? AND relay_until<=? RETURNING *`,
      )
      .bind(nonce, now + 30_000, await codeHash(code), now, now, now - 30_000, now)
      .first<RelayRow>();
    if (!row) throw fail();
    return row;
  }
  async lease(id: string, generation: number, nonce: string, reserveHint = false) {
    const now = this.now();
    const row = await this.db
      .prepare(
        `UPDATE interview_relay_sessions SET relay_until=MIN(expires_at,heartbeat+30000,?)${reserveHint ? ",hints=hints+1,last_hint=?" : ""}
      WHERE id=? AND generation=? AND nonce=? AND state='active' AND expires_at>? AND heartbeat>? AND relay_until>?
      ${reserveHint ? "AND hints<hint_limit AND last_hint<=?" : ""} RETURNING *`,
      )
      .bind(
        ...(reserveHint ? [now + 30_000, now] : [now + 30_000]),
        id,
        generation,
        nonce,
        now,
        now - 30_000,
        now,
        ...(reserveHint ? [now - 2_500] : []),
      )
      .first<RelayRow>();
    if (!row) throw fail();
    return row;
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
