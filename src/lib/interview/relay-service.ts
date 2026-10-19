import { assertInterviewAdmin, InterviewError, type InterviewUser } from "./mock-service";
import { RelayStore, type Grant, type RelayRow } from "./relay-store";
import type { LearningStore } from "./learning-store";
export type RelayConfig = { mode: "mock" | "google"; url: string; learningEnabled?: boolean };
export class InterviewRelayService {
  constructor(
    private store: RelayStore,
    private config: RelayConfig,
    private currentUser: (id: string) => Promise<InterviewUser | null>,
    private learning?: LearningStore,
  ) {}
  async run(operation: string, user: InterviewUser | null, input: Record<string, unknown>) {
    assertInterviewAdmin(user);
    if (operation === "status") return this.store.availability(user.id);
    if (operation === "start" && input.saveLearning === true && !this.config.learningEnabled)
      throw new InterviewError(503, "履歴保存はまだ利用できません。");
    if (operation === "start")
      return {
        ...(await this.store.ticket(
          user.id,
          input.duration === "developer"
            ? "developer"
            : input.duration === "full"
              ? "full"
              : "trial",
          undefined,
          input.saveLearning === true,
        )),
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
      saveLearning: row.save_learning === 1,
    };
  }
  async relay(operation: string, input: Record<string, unknown>) {
    if (operation === "redeem") {
      const code = string(input.ticket);
      if (!/^[a-f0-9]{64}$/.test(code)) throw new InterviewError(400, "チケットが不正です。");
      const row = await this.store.peek(code);
      if (!row) throw new InterviewError(410, "チケットは失効しています。");
      assertInterviewAdmin(await this.currentUser(row.owner));
      // Restore only owner-consented text, before issuing a fresh processing grant.
      const resumeContext =
        row.generation > 1 && row.save_learning === 1 && this.learning
          ? await this.learning.resumeContext(row.id, row.owner)
          : undefined;
      return {
        ...this.grant(await this.store.redeem(code, string(input.nonce))),
        ...(resumeContext ? { resumeContext } : {}),
      };
    }
    const id = string(input.id),
      nonce = string(input.nonce);
    const generation = input.generation;
    if (!Number.isSafeInteger(generation) || (generation as number) < 1)
      throw new InterviewError(400, "接続世代が不正です。");
    // Release does not enable any processing, so allow it even after owner demotion.
    if (operation === "release") return this.store.release(id, generation as number, nonce);
    if (operation === "end") {
      const reasons = [
        "CLIENT_STOP",
        "CLIENT_ABORTED",
        "CLIENT_CAPTURE_ENDED",
        "CLIENT_TRANSPORT_ERROR",
        "HEARTBEAT_UNAVAILABLE",
        "AUTHORIZATION_FAILED",
        "CLIENT_DISCONNECTED",
        "SESSION_LIMIT",
        "LEASE_EXPIRED",
        "AUTHORITY_ERROR",
        "PROVIDER_ERROR",
        "PROCESSING_ERROR",
      ];
      if (typeof input.reason !== "string" || !reasons.includes(input.reason))
        throw new InterviewError(400, "終了理由が不正です。");
      return this.store.end(id, generation as number, nonce, input.reason);
    }
    if (operation === "record") {
      const row = await this.store.get(id);
      if (
        !row ||
        row.generation !== generation ||
        row.nonce !== nonce ||
        row.expires_at <= Date.now() ||
        row.save_learning !== 1 ||
        !this.learning
      )
        throw new InterviewError(403, "学習ログの保存は許可されていません。");
      assertInterviewAdmin(await this.currentUser(row.owner));
      return this.learning.record(id, row.owner, input.event);
    }
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
