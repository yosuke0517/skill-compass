"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { capture } from "@/lib/interview/capture";
import styles from "./interview.module.css";
type Source = "interviewer" | "self";
type Session = { id: string; expiresAt: number; sequence: number };
type Reply = { id?: string; expiresAt?: number; sequence?: number; lines?: string[] };
export function InterviewPanel() {
  const [status, setStatus] = useState("停止中");
  const [mode, setMode] = useState("mock");
  const [input, setInput] = useState("display");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [device, setDevice] = useState("");
  const [self, setSelf] = useState(false);
  const [question, setQuestion] = useState("困難な課題を解決した経験を教えてください。");
  const [turns, setTurns] = useState<string[]>([]);
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [levels, setLevels] = useState({ interviewer: 0, self: 0 });
  const [seconds, setSeconds] = useState(0);
  const [hintBusy, setHintBusy] = useState(false);
  const session = useRef<Session | null>(null);
  const generation = useRef(0);
  const busy = useRef(false);
  const hintLock = useRef(false);
  const control = useRef<AbortController | null>(null);
  const queue = useRef<{ source: Source; pcm: string }[]>([]);
  const active = status === "実行中";
  async function api(operation: string, body: object, signal?: AbortSignal): Promise<Reply> {
    const response = await fetch(`/api/admin/interview/${operation}`, {
      method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8_000)]) : AbortSignal.timeout(8_000),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "接続に失敗しました。");
    return data;
  }
  const release = useCallback(() => { control.current?.abort(); control.current = null; queue.current = []; setLevels({ interviewer: 0, self: 0 }); }, []);
  const pause = useCallback(function pause(message: string, epoch: number) {
    if (epoch !== generation.current) return;
    generation.current++; release(); busy.current = false; hintLock.current = false; setHintBusy(false);
    setStatus("一時停止"); setError(`${message} 音声取得は停止しました。再接続を押してください。`);
  }, [release]);
  async function stop() {
    generation.current++; release(); busy.current = false; hintLock.current = false; setHintBusy(false);
    const previous = session.current; session.current = null;
    setStatus("停止中"); setQuestion(""); setTurns([]); setLines([]); setSeconds(0); setError("");
    if (previous) try { await api("stop", { id: previous.id }); } catch { setError("音声取得・表示は停止済みです。サーバーへの停止通知は未確認（60秒無通信で失効）。"); }
  }
  async function start(reconnect = false) {
    if (busy.current || active) return;
    busy.current = true; const epoch = ++generation.current; release(); setError(""); setStatus("接続中");
    const abort = new AbortController(); control.current = abort;
    try {
      const old = session.current;
      const reply = await api(reconnect && old ? "reconnect" : "start", old && reconnect ? { id: old.id } : {}, abort.signal);
      if (epoch !== generation.current) return;
      const current = { id: reply.id ?? old!.id, expiresAt: reply.expiresAt!, sequence: reply.sequence ?? 0 };
      session.current = current; setSeconds(Math.max(0, Math.ceil((current.expiresAt - Date.now()) / 1000)));
      if (mode === "capture") {
        let draining = false;
        const drain = async () => {
          if (draining) return; draining = true;
          try {
            while (queue.current.length && epoch === generation.current) {
              const chunk = queue.current.shift()!;
              await api("audio", { id: current.id, sequence: ++current.sequence, ...chunk }, abort.signal);
            }
          } catch (e) { pause(e instanceof Error ? e.message : "音声送信に失敗しました。", epoch); }
          finally { draining = false; }
        };
        const chunk = (source: Source, buffer: ArrayBuffer, level: number) => {
          if (epoch !== generation.current) return;
          setLevels(value => ({ ...value, [source]: level }));
          if (queue.current.length >= 20) { pause("音声送信が追いつきません。", epoch); return; }
          queue.current.push({ source, pcm: btoa(String.fromCharCode(...new Uint8Array(buffer))) }); void drain();
        };
        const ended = () => pause("音声共有が終了しました。", epoch);
        await capture("interviewer", input, device, chunk, ended, abort.signal);
        if (self && epoch === generation.current) await capture("self", "device", "", chunk, ended, abort.signal);
      }
      if (epoch === generation.current) setStatus("実行中");
    } catch (e) {
      if (epoch === generation.current) pause(e instanceof Error ? e.message : "開始できません。", epoch);
    } finally { if (epoch === generation.current) busy.current = false; }
  }
  async function hint() {
    if (!session.current || !active || hintLock.current) return;
    hintLock.current = true; setHintBusy(true); setError(""); const epoch = generation.current;
    try {
      const result = await api("hint", { id: session.current.id, text: question }, control.current?.signal);
      if (epoch !== generation.current) return;
      setTurns(value => [...value, question].slice(-6)); setLines(result.lines ?? []);
    } catch (e) { if (epoch === generation.current) setError(e instanceof Error ? e.message : "ヒントを取得できません。"); }
    finally { if (epoch === generation.current) { hintLock.current = false; setHintBusy(false); } }
  }
  useEffect(() => {
    const lifecycleGeneration = generation;
    const timer = setInterval(() => {
      const current = session.current; if (!current) return;
      const remaining = Math.max(0, Math.ceil((current.expiresAt - Date.now()) / 1000)); setSeconds(remaining);
      if (!remaining) { generation.current++; control.current?.abort(); session.current = null; queue.current = []; setStatus("停止中"); setQuestion(""); setTurns([]); setLines([]); setLevels({ interviewer: 0, self: 0 }); setError("40分の上限で停止しました。"); }
    }, 1_000);
    return () => { clearInterval(timer); lifecycleGeneration.current++; control.current?.abort(); queue.current = []; };
  }, []);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      const current = session.current; const epoch = generation.current;
      if (current) void api("pulse", { id: current.id }, control.current?.signal).catch(() => pause("接続が途切れました。", epoch));
    }, 15_000);
    return () => clearInterval(timer);
  }, [active, pause]);
  const locked = status !== "停止中";
  return <div className={styles.panel}>
    <header><h1>面接サポート</h1><p>本人が話すための、短い確認メモ。</p></header>
    <div className={styles.notice}>ローカル検証用・管理者限定。サンプル質問から固定ヒントを表示します。実音声の文字起こし・AI接続は未接続です。</div>
    <div className={styles.status} role="status"><strong>{status}{active && mode === "capture" ? " · 音声取得中" : ""}</strong><span>{seconds > 0 ? `残り ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : "手動で開始"} ／ 保存なし</span></div>
    <fieldset disabled={locked} className={styles.controls}><legend>音声入力</legend>
      <label>動作モード<select value={mode} onChange={e => setMode(e.target.value)}><option value="mock">サンプル文字列</option><option value="capture">実機の音声取得テスト（文字起こしなし）</option></select></label>
      {mode === "capture" && <><label>面接官の音声<select value={input} onChange={e => setInput(e.target.value)}><option value="display">共有タブ・システム音声</option><option value="device">入力デバイス</option></select></label>
      {input === "device" && <label>入力デバイス<select value={device} onChange={e => setDevice(e.target.value)}><option value="">既定の入力</option>{devices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || "音声入力"}</option>)}</select><button onClick={() => void navigator.mediaDevices.enumerateDevices().then(d => setDevices(d.filter(v => v.kind === "audioinput"))).catch(() => setError("入力デバイスを確認できません。"))}>デバイスを確認</button></label>}
      <label><input type="checkbox" checked={self} onChange={e => setSelf(e.target.checked)} />自分のマイクも別入力で確認</label><p>相手がブラウザなら音声共有を有効にしたタブを選択してください。アプリ・OSによってシステム音声を取得できません。同じ入力を二重に選ばないでください。</p></>}
    </fieldset>
    <div className={styles.buttons}><button disabled={locked} onClick={() => void start()}>開始</button><button disabled={status !== "一時停止"} onClick={() => void start(true)}>再接続</button><button disabled={!locked} onClick={() => void stop()}>停止・表示を消去</button></div>
    {mode === "capture" && <div className={styles.meters}>{(["interviewer", "self"] as const).map(source => <label key={source}>{source === "interviewer" ? "面接官" : "自分"}<meter min={0} max={1} value={Math.min(1, levels[source] * 5)} /></label>)}</div>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div className={styles.workspace}><section><h2>文字起こし <small>サンプル</small></h2><label>面接官の質問<textarea maxLength={500} value={question} onChange={e => setQuestion(e.target.value)} /></label><button disabled={!active || hintBusy || !question.trim()} onClick={() => void hint()}>{hintBusy ? "確認中…" : "サンプル質問を送信"}</button><div className={styles.transcript}>{turns.map((text, i) => <p key={i}><small>面接官・サンプル</small>{text}</p>)}</div></section>
    <section className={styles.cues} aria-live="polite"><h2>話す前のヒント <small>固定モック</small></h2>{lines.length ? lines.map(line => <p key={line}>{line}</p>) : <p className={styles.empty}>開始して質問を送ると、<br />整理の観点を3行で表示します。</p>}</section></div>
    <p className={styles.footer}>録音・全文の永続保存なし。音声テストはローカルサーバーに送信後破棄します。停止すると画面を消去します。回答の代作・自動発話は行いません。</p>
  </div>;
}
