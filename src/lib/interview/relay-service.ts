import { assertInterviewAdmin, InterviewError, type InterviewUser } from "./mock-service";
import { RelayStore, type Grant, type RelayRow } from "./relay-store";
export type RelayConfig = { mode: "mock" | "google"; url: string };
export class InterviewRelayService {
  constructor(
    private store: RelayStore,
    private config: RelayConfig,
    private currentUser: (id: string) => Promise<InterviewUser | null>,
  ) {}
  async run(operation: string, user: InterviewUser | null, input: Record<string, unknown>) {
    assertInterviewAdmin(user);
    if (operation === "start")
      return {
        ...(await this.store.ticket(user.id, input.duration === "full" ? "full" : "trial")),
        relayUrl: this.config.url,
        mode: this.config.mode,
      };
    const id = string(input.id);
    if (operation === "stop") return this.store.stop(id, user.id);
    if (operation === "pulse") return this.store.pulse(id, user.id);
    if (operation === "reconnect")
      return {
        ...(await this.store.ticket(user.id, "trial", id)),
        relayUrl: this.config.url,
        mode: this.config.mode,
      };
    throw new InterviewError(400, "音声・質問は認可済み中継接続へ送ってください。");
  }
  private grant(row: RelayRow): Grant {
    return {
      id: row.id,
      owner: row.owner,
      generation: row.generation,
      nonce: row.nonce!,
      expiresAt: row.expires_at,
      leaseUntil: row.relay_until,
      mode: this.config.mode,
    };
  }
  async relay(operation: string, input: Record<string, unknown>) {
    if (operation === "redeem") {
      const code = string(input.ticket);
      if (!/^[a-f0-9]{64}$/.test(code)) throw new InterviewError(400, "チケットが不正です。");
      const row = await this.store.peek(code);
      if (!row) throw new InterviewError(410, "チケットは失効しています。");
      assertInterviewAdmin(await this.currentUser(row.owner));
      return this.grant(await this.store.redeem(code, string(input.nonce)));
    }
    const id = string(input.id),
      nonce = string(input.nonce);
    const generation = input.generation;
    if (!Number.isSafeInteger(generation) || (generation as number) < 1)
      throw new InterviewError(400, "接続世代が不正です。");
    // Release does not enable any processing, so allow it even after owner demotion.
    if (operation === "release") return this.store.release(id, generation as number, nonce);
    if (operation !== "lease" && operation !== "hint")
      throw new InterviewError(404, "操作が見つかりません。");
    const row = await this.store.get(id);
    if (!row) throw new InterviewError(410, "セッションが終了しました。");
    assertInterviewAdmin(await this.currentUser(row.owner));
    return this.grant(
      await this.store.lease(id, generation as number, nonce, operation === "hint"),
    );
  }
}
function string(value: unknown) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(value))
    throw new InterviewError(400, "入力が不正です。");
  return value;
}
