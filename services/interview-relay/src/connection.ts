import { randomUUID } from "node:crypto";
import type { Authority, Grant } from "./authority.js";
import type { SpeechAdapter, SpeechStream, HintAdapter, Turn, Event } from "./shared.js";
type Wire = { send: (event: object) => void; close: () => void };
/** No provider construction or audio forwarding until Worker redeems a one-use ticket. */
export class RelayConnection {
  private phase: "new" | "auth" | "running" | "closed" = "new";
  private grant?: Grant;
  private stream?: SpeechStream;
  private timer: ReturnType<typeof setInterval>;
  private deadline: ReturnType<typeof setTimeout>;
  private leaseBusy = false;
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
        await this.authority.call("record", { ...claim, event }, AbortSignal.timeout(4000));
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
    private mode: "mock" | "google",
    private providers: () => { speech: SpeechAdapter; hints: HintAdapter },
    private now = Date.now,
    private leaseInterval = 15_000,
  ) {
    this.deadline = setTimeout(() => this.fail("接続認証がタイムアウトしました。"), 5_000);
    this.timer = setInterval(() => {
      void this.checkLease();
    }, leaseInterval);
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
      () => this.fail("利用期限または接続の確認期限で停止しました。"),
      Math.max(0, Math.min(this.grant!.leaseUntil, this.grant!.expiresAt) - this.now()),
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
          this.close();
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
    } catch {
      this.fail("接続・音声処理を継続できません。再接続または設定を確認してください。");
    }
  }
  private event(event: Event) {
    if (!this.alive()) return;
    if (event.type === "error") {
      this.fail(event.message);
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
      if (this.alive() && !signal.aborted && version === this.hintVersion) {
        this.wire.send({ type: "hints", lines, ...(requested ? { generationId } : {}) });
        if (requested) await this.record({ kind: "sent", eventId: generationId });
      }
    } catch {
      if (requested)
        await this.record({
          kind: "result",
          eventId: generationId,
          status: signal.aborted ? "aborted" : "error",
          lines: [],
          output,
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
      this.fail("接続確認の期限で停止しました。");
      return;
    }
    this.leaseBusy = true;
    try {
      const g = await this.authority.call("lease", this.claim(), this.abort.signal);
      if (!this.abort.signal.aborted) this.acceptLease(g);
    } catch {
      this.fail("利用権限を確認できないため停止しました。");
    } finally {
      this.leaseBusy = false;
    }
  }
  private fail(message: string) {
    if (this.phase === "closed") return;
    this.wire.send({ type: "error", message });
    this.close();
  }
  close() {
    if (this.phase === "closed") return;
    this.phase = "closed";
    this.abort.abort();
    this.pendingHint?.abort();
    clearTimeout(this.deadline);
    clearTimeout(this.hintTimer);
    clearInterval(this.timer);
    this.stream?.close();
    this.history = [];
    this.turnIds = [];
    this.wire.close();
    if (this.grant) {
      const release = () =>
        this.authority.call("release", this.claim(), AbortSignal.timeout(4_000));
      if (this.grant.saveLearning)
        void Promise.resolve(this.hintTask)
          .then(() => this.records)
          .then(release)
          .catch(() => {});
      else void release().catch(() => {});
    }
  }
}
