"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { capture } from "@/lib/interview/capture";
import { connectRelay, type RelayTransport } from "@/lib/interview/relay-client";
import styles from "./interview.module.css";
type Session = { id: string; expiresAt: number };
type Ticket = Session & { ticket: string; relayUrl: string };
export function RelayInterviewPanel({ providerMode }: { providerMode: "mock" | "google" }) {
  const [capturing, setCapturing] = useState(false),
    [status, setStatus] = useState("停止中"),
    [error, setError] = useState(""),
    [duration, setDuration] = useState("trial");
  const [input, setInput] = useState(providerMode === "mock" ? "sample" : "display"),
    [device, setDevice] = useState(""),
    [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [draft, setDraft] = useState("困難な課題を解決した経験を教えてください。"),
    [turns, setTurns] = useState<string[]>([]),
    [interim, setInterim] = useState(""),
    [lines, setLines] = useState<string[]>([]),
    [level, setLevel] = useState(0),
    [remaining, setRemaining] = useState(0);
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
    if (!response.ok) throw new Error(value.error ?? "接続に失敗しました。");
    return value as Ticket;
  }
  const release = useCallback(() => {
    control.current?.abort();
    control.current = null;
    socket.current?.close();
    socket.current = null;
    setLevel(0);
    setInterim("");
    setCapturing(false);
  }, []);
  const pause = useCallback(
    (message: string, current: number) => {
      if (current !== epoch.current) return;
      epoch.current++;
      release();
      busy.current = false;
      setStatus("一時停止");
      setError(message + " 音声取得は停止済みです。再接続では会話文脈を引き継ぎません。");
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
            }
          },
          () => pause("音声共有が終了しました。", current),
          abort.signal,
        );
      if (current !== epoch.current) return;
      if (input !== "sample") setCapturing(true);
      const old = session.current;
      const reply = await api(
        reconnect && old ? "reconnect" : "start",
        reconnect && old ? { id: old.id } : { duration },
        abort.signal,
      );
      if (current !== epoch.current) {
        void api("stop", { id: reply.id }).catch(() => {});
        return;
      }
      session.current = { id: reply.id, expiresAt: reply.expiresAt };
      setRemaining(Math.ceil((reply.expiresAt - Date.now()) / 1000));
      const connected = await connectRelay(
        reply.relayUrl,
        reply.ticket,
        reply.id,
        abort.signal,
        (event) => {
          if (current !== epoch.current) return;
          if (event.type === "transcript") {
            if (event.final) {
              setTurns((v) => [...v, event.text].slice(-6));
              setInterim("");
            } else setInterim(event.text);
          }
          if (event.type === "hints") setLines(event.lines);
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
      if (!s) return;
      const left = Math.max(0, Math.ceil((s.expiresAt - Date.now()) / 1000));
      setRemaining(left);
      if (!left) {
        generation.current++;
        release();
        session.current = null;
        busy.current = false;
        setStatus("停止中");
        setDraft("");
        setTurns([]);
        setLines([]);
        setError("利用時間の上限で停止しました。再接続で延長はできません。");
      }
    }, 1000);
    return () => {
      clearInterval(timer);
      generation.current++;
      control.current?.abort();
      socket.current?.close();
    };
  }, [release]);
  useEffect(() => {
    if (!active) return;
    let pending = false;
    const timer = setInterval(() => {
      const s = session.current,
        current = epoch.current;
      if (s && !pending) {
        pending = true;
        void api("pulse", { id: s.id }, control.current?.signal)
          .catch(() => pause("本人の利用許可を確認できません。", current))
          .finally(() => {
            pending = false;
          });
      }
    }, 15000);
    return () => clearInterval(timer);
  }, [active, pause]);
  return (
    <div className={styles.panel}>
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
          ／ 保存なし
        </span>
      </div>
      <fieldset disabled={locked} className={styles.controls}>
        <legend>音声入力と利用枠</legend>
        <label>
          利用時間
          <select
            aria-label="利用時間"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          >
            <option value="trial">5分試験（20ヒントまで）</option>
            <option value="full">40分本番（80ヒントまで）</option>
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
      <p className={styles.footer}>
        録音・文字起こしの永続保存なし。停止で表示を消去。回答の代作・自動発話は行いません。再接続までの音声は復元されません。
      </p>
    </div>
  );
}
