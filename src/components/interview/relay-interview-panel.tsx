"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { capture } from "@/lib/interview/capture";
import { connectRelay, type RelayTransport } from "@/lib/interview/relay-client";
import { confirmationLoop, confirmRequest, displayReceipts } from "@/lib/interview/confirmation";
import type { ClientEndReason } from "@/lib/interview/relay-client";
import styles from "./interview.module.css";
type Session = {
  id: string;
  saveLearning?: boolean;
  expiresAt: number;
  startedAt?: number;
  usageMode?: "standard" | "developer";
  hintAttempts?: number;
  hintLimit?: number | null;
};
type Ticket = Session & { ticket: string; relayUrl: string };
export function RelayInterviewPanel({
  providerMode,
  learningEnabled = false,
  initialDuration = "trial",
}: {
  providerMode: "mock" | "google";
  learningEnabled?: boolean;
  initialDuration?: "trial" | "developer";
}) {
  const [saveLearning, setSaveLearning] = useState(false);
  const [displayedGeneration, setDisplayedGeneration] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [leaseSession, setLeaseSession] = useState<Session | null>(null);
  const pulseFromAudio = useRef<() => void>(() => {});
  const [capturing, setCapturing] = useState(false),
    [status, setStatus] = useState("停止中"),
    [error, setError] = useState(""),
    [duration, setDuration] = useState<string>(initialDuration);
  const [input, setInput] = useState(providerMode === "mock" ? "sample" : "display"),
    [device, setDevice] = useState(""),
    [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [draft, setDraft] = useState("困難な課題を解決した経験を教えてください。"),
    [turns, setTurns] = useState<string[]>([]),
    [interim, setInterim] = useState(""),
    [lines, setLines] = useState<string[]>([]),
    [level, setLevel] = useState(0),
    [remaining, setRemaining] = useState(0);
  const [usageMode, setUsageMode] = useState<"standard" | "developer">("standard");
  const [elapsed, setElapsed] = useState(0);
  const [hintAttempts, setHintAttempts] = useState(0);
  const [generated, setGenerated] = useState(0);
  const [rotations, setRotations] = useState(0);
  const [resumedTurns, setResumedTurns] = useState(0);
  const [connectionGeneration, setConnectionGeneration] = useState(1);
  const confirmedAt = useRef(0);
  const receipts = useRef<ReturnType<typeof displayReceipts> | null>(null);
  const session = useRef<Session | null>(null),
    socket = useRef<RelayTransport | null>(null),
    control = useRef<AbortController | null>(null),
    epoch = useRef(0),
    busy = useRef(false);
  const active = status === "実行中",
    locked = status !== "停止中";
  async function api(operation: string, body: object, signal?: AbortSignal) {
    const response = await fetch(`/api/admin/interview/${operation}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(8_000)])
        : AbortSignal.timeout(8_000),
    });
    const value = await response.json();
    if (!response.ok)
      throw new Error(
        (value.error ?? "接続に失敗しました。") + (value.code ? ` [${value.code}]` : ""),
      );
    return value as Ticket;
  }
  const release = useCallback((reason: ClientEndReason = "CLIENT_STOP") => {
    setLeaseSession(null);
    socket.current?.close(reason);
    control.current?.abort();
    control.current = null;
    socket.current = null;
    setLevel(0);
    setInterim("");
    setCapturing(false);
  }, []);
  const pause = useCallback(
    (message: string, current: number, reason: ClientEndReason = "CLIENT_TRANSPORT_ERROR") => {
      if (current !== epoch.current) return;
      epoch.current++;
      release(reason);
      busy.current = false;
      setStatus("一時停止");
      setError(
        message +
          (session.current
            ? " 音声取得は停止済みです。保存ありの場合のみ直近6発話を再接続時に復元します。中断中の音声は復元できません。"
            : " 音声取得は停止済みです。停止ボタンで戻ると利用時間を選び直せます。"),
      );
    },
    [release],
  );
  async function stop() {
    epoch.current++;
    release();
    busy.current = false;
    const old = session.current;
    session.current = null;
    setStatus("停止中");
    setTurns([]);
    setLines([]);
    setDisplayedGeneration(undefined);
    setDraft("");
    setRemaining(0);
    setError("");
    if (old)
      try {
        await api("stop", { id: old.id });
      } catch {
        setError(
          "端末の音声取得・表示は停止済みです。サーバー通知は未確認で、最大30秒のlease期限で失効します。",
        );
      }
  }
  async function start(reconnect = false) {
    if (busy.current || active) return;
    busy.current = true;
    const current = ++epoch.current;
    release();
    setStatus("接続中");
    setError("");
    setLines([]);
    setDisplayedGeneration(undefined);
    const abort = new AbortController();
    control.current = abort;
    try {
      // Ask permission on the user's click, before issuing a 30-second ticket. Discard audio until ready.
      if (input !== "sample")
        await capture(
          "interviewer",
          input,
          device,
          (_source, buffer, meter) => {
            if (current === epoch.current) {
              setLevel(meter);
              socket.current?.audio(buffer);
              pulseFromAudio.current();
            }
          },
          () => pause("音声共有が終了しました。", current, "CLIENT_CAPTURE_ENDED"),
          abort.signal,
        );
      if (current !== epoch.current) return;
      if (input !== "sample") setCapturing(true);
      const old = session.current;
      confirmedAt.current = performance.now();
      const reply = await api(
        reconnect && old ? "reconnect" : "start",
        reconnect && old ? { id: old.id } : { duration, saveLearning },
        abort.signal,
      );
      if (current !== epoch.current) {
        void api("stop", { id: reply.id }).catch(() => {});
        return;
      }
      session.current = reply;
      setLeaseSession(reply);
      setSaving(reply.saveLearning === true);
      setUsageMode(reply.usageMode ?? "standard");
      setElapsed(Math.max(0, Math.floor((Date.now() - (reply.startedAt ?? Date.now())) / 1000)));
      setHintAttempts(reply.hintAttempts ?? 0);
      if (!reconnect) {
        setGenerated(0);
        setRotations(0);
        setTurns([]);
      }
      setResumedTurns(0);
      setRemaining(Math.ceil((reply.expiresAt - Date.now()) / 1000));
      const connected = await connectRelay(
        reply.relayUrl,
        reply.ticket,
        reply.id,
        abort.signal,
        (event) => {
          if (current !== epoch.current) return;
          if (event.type === "ready") {
            setResumedTurns(event.resumedTurns);
            setConnectionGeneration(event.generation);
          }
          if (event.type === "status") setRotations((n) => n + 1);
          if (event.type === "transcript") {
            if (event.final) {
              setTurns((v) => [...v, event.text].slice(-6));
              setInterim("");
            } else setInterim(event.text);
          }
          if (event.type === "hints") {
            setLines(event.lines);
            setDisplayedGeneration(event.generationId);
            setGenerated((n) => n + 1);
          }
          if (event.type === "warning") setError(event.message);
        },
        (message) => pause(message, current),
      );
      if (current === epoch.current) {
        socket.current = connected;
        setStatus("実行中");
      } else connected.close();
    } catch (e) {
      if (current === epoch.current)
        pause(e instanceof Error ? e.message : "接続できません。", current);
    } finally {
      if (current === epoch.current) busy.current = false;
    }
  }
  useEffect(() => {
    const generation = epoch;
    const timer = setInterval(() => {
      const s = session.current;
      if (!s || !control.current) return;
      const left = Math.max(0, Math.ceil((s.expiresAt - Date.now()) / 1000));
      setRemaining(left);
      if (s.startedAt) setElapsed(Math.max(0, Math.floor((Date.now() - s.startedAt) / 1000)));
      if (!left) {
        generation.current++;
        release("SESSION_LIMIT");
        session.current = null;
        busy.current = false;
        setStatus("停止中");
        setDraft("");
        setTurns([]);
        setLines([]);
        setDisplayedGeneration(undefined);
        setError("利用時間の上限で停止しました。再接続で延長はできません。");
      }
    }, 1000);
    return () => {
      clearInterval(timer);
      generation.current++;
      socket.current?.close("CLIENT_ABORTED");
      control.current?.abort();
    };
  }, [release]);
  useEffect(() => {
    if (!leaseSession) return;
    const current = epoch.current;
    const loop = confirmationLoop({
      confirmedAt: confirmedAt.current,
      request: (signal) =>
        confirmRequest("/api/admin/interview/pulse", { id: leaseSession.id }, signal),
      success: (reply) => {
        if (current === epoch.current) setHintAttempts((n) => Math.max(n, reply.hintAttempts ?? n));
      },
      failure: (code, denied) =>
        pause(
          `接続確認を完了できないため停止しました。[${code}]`,
          current,
          denied ? "AUTHORIZATION_FAILED" : "HEARTBEAT_UNAVAILABLE",
        ),
    });
    pulseFromAudio.current = loop.pulse;
    return () => {
      loop.stop();
      pulseFromAudio.current = () => {};
    };
  }, [leaseSession, pause]);
  useEffect(() => {
    const queue = displayReceipts(
      (sessionId, generationId, signal) =>
        confirmRequest(
          "/api/admin/interview-learning/displayed",
          { sessionId, generationId },
          signal,
        ),
      () => setError("画面反映の記録を保存できませんでした。"),
    );
    receipts.current = queue;
    return () => {
      queue.stop();
      receipts.current = null;
    };
  }, []);
  useEffect(() => {
    const current = session.current;
    if (!displayedGeneration || !current?.saveLearning || !active) return;
    const acknowledge = () => {
      if (document.visibilityState === "visible")
        receipts.current?.add(current.id, displayedGeneration);
    };
    const frame = requestAnimationFrame(acknowledge);
    document.addEventListener("visibilitychange", acknowledge);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", acknowledge);
    };
  }, [displayedGeneration, active]);
  return (
    <div className={styles.panel}>
      <p>
        音声認識の更新 {rotations}回 ／ 接続世代 {connectionGeneration} ／ 復元した発話{" "}
        {resumedTurns}件
      </p>
      <header>
        <h1>面接サポート</h1>
        <p>本人が話すための、短い確認メモ。</p>
      </header>
      <div className={styles.notice}>
        {providerMode === "mock"
          ? "中継のローカル結合テスト。認証・チケット・音声送信は実経路、文字起こしとヒントはサンプルです。Google APIは呼びません。"
          : "Google音声認識・ヒント生成。開始すると選択した相手音声が送信されます。"}
      </div>
      <div className={styles.status} role="status">
        <strong>
          {status}
          {capturing ? " · 音声取得中" : ""}
        </strong>
        <span>
          {remaining > 0
            ? `残り ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`
            : "手動で開始"}{" "}
          ／ {saving && locked ? "文字の保存あり" : "保存なし"}
        </span>
      </div>
      <p aria-label="利用モードと使用状況">
        現在のモード：
        {locked && remaining > 0
          ? usageMode === "developer"
            ? "本人限定・開発者試験"
            : "通常の予約枠"
          : duration === "developer"
            ? "開発者試験（開始前）"
            : duration === "full"
              ? "60分本番（開始前）"
              : "5分試験（開始前）"}
        {` ／ 経過 ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")} ／ ヒント表示 ${generated}回 ／ 生成試行 ${hintAttempts}回（定期更新）`}
      </p>
      {usageMode === "developer" && (
        <p>
          開始回数・ヒント総回数の固定上限なし。通常の予約枠は消費しません。1接続60分、同時接続1件、生成間隔と費用目安枠による停止は有効です。Googleの実請求上限ではありません。
        </p>
      )}
      <fieldset disabled={locked} className={styles.controls}>
        <legend>音声入力と利用枠</legend>
        <label>
          <input
            type="checkbox"
            checked={saveLearning}
            disabled={!learningEnabled}
            onChange={(e) => setSaveLearning(e.target.checked)}
          />
          文字の履歴を30日保存する（任意）
        </label>
        <p>
          保存する場合：確定した文字起こし、モデルへの入力、ヒントと評価を保存します。音声は保存しません。
          {!learningEnabled && "履歴保存は準備中です。"}
        </p>
        <label>
          利用時間
          <select
            aria-label="利用時間"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          >
            <option value="trial">5分試験（20ヒントまで）</option>
            <option value="full">60分本番（80ヒントまで）</option>
            <option value="developer">開発者試験（60分・本人への個別許可が必要）</option>
          </select>
        </label>
        <label>
          面接官の音声
          <select
            aria-label="面接官の音声"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          >
            {providerMode === "mock" && <option value="sample">サンプル文字列</option>}
            <option value="display">共有タブ・システム音声</option>
            <option value="device">入力デバイス</option>
          </select>
        </label>
        {input === "device" && (
          <label>
            入力デバイス
            <select value={device} onChange={(e) => setDevice(e.target.value)}>
              <option value="">既定の入力</option>
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || "音声入力"}
                </option>
              ))}
            </select>
            <button
              onClick={() =>
                void navigator.mediaDevices
                  .enumerateDevices()
                  .then((d) => setDevices(d.filter((v) => v.kind === "audioinput")))
                  .catch(() => setError("入力一覧を取得できません。"))
              }
            >
              デバイスを確認
            </button>
          </label>
        )}
        <p>
          初回は相手音声だけを送ります。自分のマイクは追加しません。共有画面の映像は送信しません。OS・アプリによって音声共有が使えない場合があります。
        </p>
      </fieldset>
      <div className={styles.buttons}>
        <button disabled={locked} onClick={() => void start()}>
          開始
        </button>
        <button disabled={status !== "一時停止"} onClick={() => void start(true)}>
          再接続
        </button>
        <button disabled={!locked} onClick={() => void stop()}>
          停止・表示を消去
        </button>
      </div>
      {input !== "sample" && (
        <label>
          面接官の音量
          <meter min={0} max={1} value={Math.min(1, level * 5)} />
        </label>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <div className={styles.workspace}>
        <section>
          <h2>
            文字起こし <small>{providerMode === "mock" ? "サンプル" : "相手音声"}</small>
          </h2>
          {providerMode === "mock" && (
            <>
              <label>
                面接官の質問
                <textarea
                  maxLength={500}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
              </label>
              <button
                disabled={!active || !draft.trim()}
                onClick={() => socket.current?.sample(draft)}
              >
                サンプル質問を送信
              </button>
            </>
          )}
          <div className={styles.transcript}>
            {turns.map((t, i) => (
              <p key={i}>
                <small>面接官{providerMode === "mock" ? "・サンプル" : ""}</small>
                {t}
              </p>
            ))}
            {interim && (
              <p>
                <small>認識中</small>
                {interim}
              </p>
            )}
          </div>
        </section>
        <section className={styles.cues} aria-live="polite">
          <h2>
            話す前のヒント <small>{providerMode === "mock" ? "固定モック" : "回答構成"}</small>
          </h2>
          {lines.length ? (
            lines.map((line) => <p key={line}>{line}</p>)
          ) : (
            <p className={styles.empty}>
              質問を受け取ると、
              <br />
              整理の観点を2〜3行で表示します。
            </p>
          )}
        </section>
      </div>
      <a href="/admin/interview/history">保存した履歴・評価を見る</a>
      <p className={styles.footer}>
        音声の保存なし。文字の保存は開始前に選択した場合のみ30日間。停止は表示を消去し、保存済み履歴は履歴画面から削除できます。回答の代作・自動発話は行いません。再接続までの音声は復元されません。
      </p>
    </div>
  );
}
