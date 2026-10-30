import { randomUUID } from "node:crypto";
import { retryableAuthority, type Authority, type Grant } from "./authority.js";
import type { SpeechAdapter, SpeechStream, HintAdapter, Turn, Event } from "./shared.js";
type EndReason =
  | "CLIENT_STOP"
  | "CLIENT_ABORTED"
  | "CLIENT_CAPTURE_ENDED"
  | "CLIENT_TRANSPORT_ERROR"
  | "HEARTBEAT_UNAVAILABLE"
  | "AUTHORIZATION_FAILED"
  | "CLIENT_DISCONNECTED"
  | "SESSION_LIMIT"
  | "LEASE_EXPIRED"
  | "AUTHORITY_ERROR"
  | "PROVIDER_ERROR"
  | "PROCESSING_ERROR";
type Wire = { send: (event: object) => void; close: () => void };
/** No provider construction or audio forwarding until Worker redeems a one-use ticket. */
export class RelayConnection {
  private phase: "new" | "auth" | "running" | "closed" = "new";
  private grant?: Grant;
  private stream?: SpeechStream;
  private timer?: ReturnType<typeof setTimeout>;
  private deadline: ReturnType<typeof setTimeout>;
  private leaseBusy = false;
  private leaseFailures = 0;
  private abort = new AbortController();
  private pendingHint?: AbortController;
  private hintTimer?: ReturnType<typeof setTimeout>;
  private history: Turn[] = [];
  private hintBusy = false;
  private hintTask?: Promise<void>;
  private hintVersion = 0;
  private lastHint = -Infinity;
  private sequence = 0;
  private windowAt = Date.now();
  private bytes = 0;
  private messages = 0;
  private startedAt = Date.now();
  private totalBytes = 0;
  private turnIds: string[] = [];
  private records: Promise<void> = Promise.resolve();
  private recordPending = 0;
  private async record(event: object) {
    if (!this.grant?.saveLearning) return;
    if (this.recordPending >= 32) {
      this.wire.send({
        type: "warning",
        message: "学習ログ保存が混雑しています。一部の記録を保存できません。",
      });
      return;
    }
    const claim = this.claim();
    this.recordPending++;
    this.records = this.records
      .then(async () => {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            await this.authority.call("record", { ...claim, event }, AbortSignal.timeout(4000));
            break;
          } catch (error) {
            if (attempt === 2 || !retryableAuthority(error)) throw error;
          }
        }
      })
      .catch(() => {
        if (this.alive())
          this.wire.send({
            type: "warning",
            message: "学習ログを保存できませんでした。履歴に欠落がある可能性があります。",
          });
      })
      .finally(() => {
        this.recordPending--;
      });
    await this.records;
  }
  constructor(
    private wire: Wire,
    private authority: Authority,
    private mode: "mock" | "google" | "openai",
    private providers: () => { speech: SpeechAdapter; hints: HintAdapter },
    private now = Date.now,
    private leaseInterval = 15_000,
  ) {
    this.deadline = setTimeout(() => this.fail("接続認証がタイムアウトしました。"), 5_000);
  }
  private hints?: HintAdapter;
  private claim() {
    const g = this.grant!;
    return { id: g.id, generation: g.generation, nonce: g.nonce };
  }
  private alive() {
    return (
      this.phase === "running" &&
      !!this.grant &&
      this.now() < Math.min(this.grant.leaseUntil, this.grant.expiresAt)
    );
  }
  private arm() {
    clearTimeout(this.deadline);
    this.deadline = setTimeout(
      () => {
        if (this.alive()) {
          this.arm();
          return;
        }
        this.fail(
          this.now() >= this.grant!.expiresAt
            ? "利用時間の上限に達したため停止しました。[SESSION_LIMIT]"
            : "接続確認の更新が期限に間に合わなかったため停止しました。[LEASE_EXPIRED]",
          this.now() >= this.grant!.expiresAt ? "SESSION_LIMIT" : "LEASE_EXPIRED",
        );
      },
      Math.max(0, Math.min(this.grant!.leaseUntil, this.grant!.expiresAt) - this.now()),
    );
    this.scheduleLease();
  }
  private scheduleLease() {
    clearTimeout(this.timer);
    if (!this.alive() || this.leaseBusy) return;
    // Heartbeat and relay renewal can have different phases. Renew BEFORE the
    // granted deadline, including when a stale heartbeat shortened the lease.
    const remaining = Math.min(this.grant!.leaseUntil, this.grant!.expiresAt) - this.now();
    this.timer = setTimeout(
      () => void this.checkLease(),
      this.leaseFailures
        ? 500 * this.leaseFailures
        : Math.max(1000, Math.min(this.leaseInterval, remaining - 8000)),
    );
  }
  async message(raw: Buffer, isBinary: boolean) {
    if (this.phase === "closed") return;
    try {
      if (this.now() - this.windowAt >= 1_000) {
        this.windowAt = this.now();
        this.bytes = 0;
        this.messages = 0;
      }
      if (++this.messages > 30) throw new Error("送信頻度が高すぎます。");
      if (this.phase === "new") {
        if (isBinary || raw.length > 4096) throw new Error("先に接続チケットが必要です。");
        const data = JSON.parse(raw.toString());
        if (data.type !== "authorize" || !/^[a-f0-9]{64}$/.test(data.ticket))
          throw new Error("接続チケットが必要です。");
        this.phase = "auth";
        const nonce = randomUUID();
        const grant = await this.authority.call(
          "redeem",
          { ticket: data.ticket, nonce },
          this.abort.signal,
        );
        if (this.abort.signal.aborted) {
          void this.authority
            .call(
              "release",
              { id: grant.id, generation: grant.generation, nonce: grant.nonce },
              AbortSignal.timeout(4_000),
            )
            .catch(() => {});
          return;
        }
        this.grant = grant;
        if (
          grant.nonce !== nonce ||
          grant.mode !== this.mode ||
          grant.leaseUntil <= this.now() ||
          grant.leaseUntil > this.now() + 30_500 ||
          grant.expiresAt <= this.now()
        )
          throw new Error("接続の認可条件が一致しません。");
        // Restoring context never schedules a hint or replays audio. Only a new final turn does.
        if (grant.saveLearning && grant.resumeContext) {
          this.history = grant.resumeContext.map(({ source, text }) => ({ source, text }));
          this.turnIds = grant.resumeContext.map((t) => t.id);
        }
        this.phase = "running";
        this.arm();
        this.startedAt = this.now();
        const adapters = this.providers();
        this.hints = adapters.hints;
        this.stream = adapters.speech.open("interviewer", (event) => this.event(event));
        if (!this.alive()) {
          this.stream.close();
          return;
        }
        this.wire.send({
          type: "ready",
          id: grant.id,
          expiresAt: grant.expiresAt,
          mode: this.mode,
          resumedTurns: this.history.length,
          generation: grant.generation,
        });
        return;
      }
      if (!this.alive()) throw new Error("接続が有効ではありません。");
      if (isBinary) {
        // 4-byte monotonically increasing sequence + exactly 100 ms mono PCM16.
        if (raw.length !== 3204 || raw.readUInt32BE(0) !== this.sequence + 1)
          throw new Error("音声の順序・長さが不正です。");
        this.bytes += 3200;
        this.totalBytes += 3200;
        if (
          this.bytes > 64_000 ||
          this.totalBytes > 32_000 * ((this.now() - this.startedAt) / 1000 + 2)
        )
          throw new Error("音声が実時間より速く送信されています。");
        this.sequence++;
        this.stream!.write(raw.subarray(4));
        this.wire.send({ type: "ack", sequence: this.sequence });
      } else {
        if (raw.length > 4096) throw new Error("要求が大きすぎます。");
        const data = JSON.parse(raw.toString());
        if (data.type === "stop") {
          const allowed: EndReason[] = [
            "CLIENT_STOP",
            "CLIENT_ABORTED",
            "CLIENT_CAPTURE_ENDED",
            "CLIENT_TRANSPORT_ERROR",
            "HEARTBEAT_UNAVAILABLE",
            "AUTHORIZATION_FAILED",
            "SESSION_LIMIT",
          ];
          this.close(
            allowed.includes(data.reason)
              ? data.reason
              : data.reason === undefined
                ? "CLIENT_STOP"
                : "CLIENT_DISCONNECTED",
          );
          return;
        }
        if (
          this.mode === "mock" &&
          data.type === "sample" &&
          typeof data.text === "string" &&
          data.text.length <= 500
        ) {
          this.event({ type: "transcript", source: "interviewer", text: data.text, final: true });
          return;
        }
        throw new Error("対応していない操作です。");
      }
    } catch (error) {
      // Fixed codes and counters only: never log audio, tickets, transcript or provider errors.
      const codes: Record<string, string> = {
        "送信頻度が高すぎます。": "MESSAGE_RATE",
        "接続が有効ではありません。": "GRANT_EXPIRED",
        "音声の順序・長さが不正です。": "AUDIO_SEQUENCE",
        "音声が実時間より速く送信されています。": "AUDIO_RATE",
        "音声送信が追いつきません。再接続してください。": "SPEECH_BACKPRESSURE",
        "音声チャンクの形式が不正です。": "AUDIO_FORMAT",
      };
      const code = error instanceof Error ? codes[error.message] ?? "UNCLASSIFIED" : "UNCLASSIFIED";
      console.warn(JSON.stringify({ event: "relay_processing_error", code,
        sessionId: this.grant?.id, sequence: this.sequence, messages: this.messages,
        windowBytes: this.bytes, totalBytes: this.totalBytes, elapsedMs: this.now() - this.startedAt }));
      this.fail(`接続・音声処理を継続できません。[${code}] 再接続または設定を確認してください。`);
    }
  }
  private event(event: Event) {
    if (!this.alive()) return;
    if (event.type === "error") {
      this.fail(event.message, "PROVIDER_ERROR");
      return;
    }
    if (event.type !== "transcript") {
      this.wire.send(event);
      return;
    }
    const text = event.text.trim().slice(0, 1000);
    if (!text) return;
    this.wire.send({ ...event, text });
    if (event.final) {
      if (this.grant?.saveLearning) {
        const turnId = randomUUID();
        this.turnIds = [...this.turnIds, turnId].slice(-6);
        void this.record({ kind: "turn", eventId: turnId, source: event.source, text: event.text });
      }
      this.history = [...this.history, { source: event.source, text: text.slice(-500) }].slice(-6);
      this.hintVersion++;
      this.scheduleHint();
    }
  }
  private scheduleHint() {
    clearTimeout(this.hintTimer);
    if (this.hintBusy) return;
    this.hintTimer = setTimeout(
      () => {
        this.hintTask = this.generateHint();
      },
      Math.max(300, 2500 - (this.now() - this.lastHint)),
    );
  }
  private async generateHint() {
    if (!this.alive() || this.hintBusy) return;
    this.hintBusy = true;
    const version = this.hintVersion;
    const generationId = randomUUID();
    const turnIds = [...this.turnIds];
    const turns = [...this.history];
    const started = this.now();
    let output: string | undefined;
    let requested = false;
    let stage = "authority";
    const controller = new AbortController();
    this.pendingHint = controller;
    const timeout = setTimeout(() => {
      controller.abort();
      if (this.alive())
        this.wire.send({ type: "warning", message: "ヒント生成がタイムアウトしました。" });
    }, 8_000);
    const signal = AbortSignal.any([controller.signal, this.abort.signal]);
    try {
      // Reserve before every attempt. Failed/aborted attempts are not refunded.
      const grant = await this.authority.call("hint", this.claim(), signal);
      this.acceptLease(grant);
      signal.throwIfAborted();
      if (!this.alive()) return;
      this.lastHint = this.now();
      stage = "generation";
      const lines = await this.hints!.generate(
        turns,
        signal,
        this.grant?.saveLearning
          ? async (trace) => {
              if (trace.request) {
                requested = true;
                await this.record({
                  kind: "request",
                  eventId: generationId,
                  turnIds,
                  request: trace.request,
                });
              }
              if (trace.output !== undefined) output = trace.output;
            }
          : undefined,
      );
      // The provider deadline must not include result/sent persistence latency.
      clearTimeout(timeout);
      signal.throwIfAborted();
      stage = "result_record";
      if (requested)
        await this.record({
          kind: "result",
          eventId: generationId,
          status: "success",
          lines,
          output,
          errorCode: null,
          latencyMs: Math.max(0, this.now() - started),
        });
      signal.throwIfAborted();
      if (this.alive() && version === this.hintVersion) {
        this.wire.send({ type: "hints", lines, ...(requested ? { generationId } : {}) });
        if (requested) await this.record({ kind: "sent", eventId: generationId });
      }
    } catch {
      console.warn(JSON.stringify({ event: "relay_hint_failed", stage,
        sessionId: this.grant?.id, generationId, requested,
        aborted: signal.aborted, sessionEnded: this.abort.signal.aborted,
        elapsedMs: Math.max(0, this.now() - started) }));
      if (requested)
        await this.record({
          kind: "result",
          eventId: generationId,
          status: signal.aborted ? "aborted" : "error",
          lines: [],
          output: signal.aborted ? undefined : output,
          errorCode: signal.aborted ? "ABORTED" : "GENERATION_FAILED",
          latencyMs: Math.max(0, this.now() - started),
        });
      if (this.alive() && !signal.aborted)
        this.wire.send({
          type: "warning",
          message: "ヒントを取得できませんでした。時間切れ・利用枠・接続を確認してください。",
        });
    } finally {
      clearTimeout(timeout);
      this.hintBusy = false;
      if (version !== this.hintVersion && this.alive()) this.scheduleHint();
    }
  }
  private acceptLease(g: Grant) {
    const old = this.grant!;
    if (
      g.id !== old.id ||
      g.owner !== old.owner ||
      g.generation !== old.generation ||
      g.nonce !== old.nonce ||
      g.mode !== old.mode ||
      g.saveLearning !== old.saveLearning ||
      g.expiresAt !== old.expiresAt ||
      g.leaseUntil > this.now() + 30_500
    )
      throw new Error("Lease changed");
    // A slow earlier response cannot shorten a fresher grant; never accept an expired response.
    if (g.leaseUntil <= this.now()) throw new Error("Lease expired");
    this.grant = { ...g, leaseUntil: Math.max(old.leaseUntil, g.leaseUntil) };
    this.arm();
  }
  private async checkLease() {
    if (this.phase !== "running" || this.leaseBusy) return;
    if (!this.alive()) {
      const reason = this.now() >= this.grant!.expiresAt ? "SESSION_LIMIT" : "LEASE_EXPIRED";
      this.fail(`利用時間または接続確認の期限で停止しました。[${reason}]`, reason);
      return;
    }
    this.leaseBusy = true;
    try {
      const g = await this.authority.call("lease", this.claim(), this.abort.signal);
      if (!this.abort.signal.aborted) {
        this.acceptLease(g);
        this.leaseFailures = 0;
      }
    } catch (error) {
      // Retry only within the already granted deadline; arm() still enforces it.
      if (retryableAuthority(error) && ++this.leaseFailures < 3 && this.alive()) return;
      this.fail("利用権限を確認できないため停止しました。[AUTHORITY_ERROR]", "AUTHORITY_ERROR");
    } finally {
      this.leaseBusy = false;
      this.scheduleLease();
    }
  }
  private fail(message: string, reason: EndReason = "PROCESSING_ERROR") {
    if (this.phase === "closed") return;
    this.wire.send({ type: "error", message });
    this.close(reason);
  }
  close(reason: EndReason = "CLIENT_DISCONNECTED") {
    if (this.phase === "closed") return;
    this.phase = "closed";
    this.abort.abort();
    this.pendingHint?.abort();
    clearTimeout(this.deadline);
    clearTimeout(this.hintTimer);
    clearTimeout(this.timer);
    this.stream?.close();
    this.history = [];
    this.turnIds = [];
    this.wire.close();
    if (this.grant) {
      const end = (async () => {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            await this.authority.call(
              "end",
              { ...this.claim(), reason },
              AbortSignal.timeout(4000),
            );
            return;
          } catch (error) {
            if (!retryableAuthority(error)) return;
          }
        }
      })();
      const release = () =>
        this.authority.call("release", this.claim(), AbortSignal.timeout(4_000));
      if (this.grant.saveLearning)
        void Promise.resolve(this.hintTask)
          .then(() => this.records)
          .then(() => end)
          .then(release)
          .catch(() => {});
      else void end.then(release).catch(() => {});
    }
  }
}
