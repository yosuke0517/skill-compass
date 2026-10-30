import WebSocket from "ws";
import type { EventEmitter } from "node:events";
import type { SpeechAdapter, SpeechStream, Source, Event } from "../shared.js";

type Socket = Pick<EventEmitter, "on"> & Pick<WebSocket, "send" | "terminate" | "readyState" | "bufferedAmount">;
type Item = { text: string; final?: string };
const failure = "OpenAI音声認識の接続を継続できません。設定・利用枠を確認し、再接続してください。";

// The browser contract stays PCM16/16 kHz/100 ms. Resample only at this boundary.
function pcm24(audio: Buffer) {
  const out = Buffer.alloc(4800);
  for (let i = 0; i < 2400; i++) {
    const at = i * 2 / 3, left = Math.floor(at), fraction = at - left;
    const a = audio.readInt16LE(left * 2), b = audio.readInt16LE(Math.min(left + 1, 1599) * 2);
    out.writeInt16LE(Math.round(a + (b - a) * fraction), i * 2);
  }
  return out;
}

export class OpenAISpeech implements SpeechAdapter {
  constructor(private key: string, private connect: (key: string) => Socket = key => new WebSocket(
    "wss://api.openai.com/v1/realtime?intent=transcription",
    { headers: { Authorization: `Bearer ${key}` }, maxPayload: 65536, handshakeTimeout: 10000, followRedirects: false },
  )) {
    if (!key.trim()) throw new Error("OPENAI_API_KEYを中継サーバーに設定してください。");
  }
  open(source: Source, emit: (event: Event) => void): SpeechStream {
    const ws = this.connect(this.key);
    let closed = false, ready = false, finishing = false;
    let speech = false, silence = 0, frames = 0, outstanding = 0;
    const queued: Buffer[] = [], preroll: Buffer[] = [];
    const items = new Map<string, Item>(), order: string[] = [], completed = new Set<string>();
    let finishPromise: Promise<void> | undefined, finishResolve: (() => void) | undefined,
      finishReject: ((error: Error) => void) | undefined;
    let drainTimer: ReturnType<typeof setTimeout> | undefined;
    const startup = setTimeout(() => fail(), 10000);
    const close = () => {
      if (closed) return;
      closed = true; clearTimeout(startup); clearTimeout(drainTimer);
      queued.length = 0; preroll.length = 0; items.clear(); order.length = 0; completed.clear();
      finishResolve?.();
      ws.terminate();
    };
    const fail = () => {
      if (closed) return;
      finishReject?.(new Error(failure)); close(); emit({ type: "error", message: failure });
    };
    const send = (event: object) => {
      if (closed) return;
      if (ws.readyState !== WebSocket.OPEN || ws.bufferedAmount > 128000) { fail(); return; }
      ws.send(JSON.stringify(event));
    };
    const drain = () => { if (finishing && ready && outstanding === 0) { finishResolve?.(); close(); } };
    const commit = () => {
      if (!speech || closed) return;
      if (++outstanding > 16) { fail(); return; }
      send({ type: "input_audio_buffer.commit" });
      speech = false; silence = 0; frames = 0;
    };
    const append = (audio: Buffer) => { send({ type: "input_audio_buffer.append", audio: pcm24(audio).toString("base64") }); frames++; };
    const process = (audio: Buffer) => {
      let power = 0;
      for (let i = 0; i < 1600; i++) power += (audio.readInt16LE(i * 2) / 32768) ** 2;
      // Bounded energy VAD: 600 ms trailing silence, 200 ms pre-roll, 15 s max turn.
      // Threshold must be evaluated on representative audio before production rollout.
      const voiced = Math.sqrt(power / 1600) >= 0.01;
      if (!speech && !voiced) { preroll.push(Buffer.from(audio)); if (preroll.length > 2) preroll.shift(); return; }
      if (!speech) { speech = true; for (const prior of preroll.splice(0)) append(prior); }
      append(audio);
      silence = voiced ? 0 : silence + 1;
      if (silence >= 6 || frames >= 150) commit();
    };
    ws.on("open", () => {
      if (closed) return;
      send({ type: "session.update", session: { type: "transcription", audio: { input: {
        format: { type: "audio/pcm", rate: 24000 },
        transcription: { model: "gpt-live-transcribe", languages: ["ja"], delay: "low" },
        turn_detection: null,
      } } } });
    });
    ws.on("message", raw => {
      if (closed) return;
      try {
        const e = JSON.parse(String(raw));
        if (e.type === "error" || e.type === "conversation.item.input_audio_transcription.failed") { fail(); return; }
        if (e.type === "session.updated") {
          ready = true; clearTimeout(startup);
          for (const audio of queued.splice(0)) { if (closed) break; process(audio); }
          if (finishing) { commit(); drain(); }
          return;
        }
        if (typeof e.item_id !== "string" || e.item_id.length > 256 || completed.has(e.item_id)) return;
        if (e.type === "input_audio_buffer.committed") {
          if (!order.includes(e.item_id)) order.push(e.item_id);
        } else if (e.type === "conversation.item.input_audio_transcription.delta") {
          if (typeof e.delta !== "string") { fail(); return; }
          const item = items.get(e.item_id) ?? { text: "" };
          item.text += e.delta; items.set(e.item_id, item);
          if (item.text.length > 16000) { fail(); return; }
          emit({ type: "transcript", source, text: item.text, final: false });
        } else if (e.type === "conversation.item.input_audio_transcription.completed") {
          if (typeof e.transcript !== "string" || e.transcript.length > 16000) { fail(); return; }
          items.set(e.item_id, { text: "", final: e.transcript });
        }
        if (items.size > 16 || order.length > 16) { fail(); return; }
        // Commit acknowledgements arrive on one ordered socket; final results may not.
        while (order.length && items.get(order[0])?.final !== undefined) {
          const id = order.shift()!, text = items.get(id)!.final!;
          items.delete(id); completed.add(id); outstanding--;
          if (completed.size > 256) completed.delete(completed.values().next().value!);
          if (outstanding < 0) { fail(); return; }
          if (text.trim()) emit({ type: "transcript", source, text, final: true });
          if (closed) return;
        }
        drain();
      } catch { fail(); }
    });
    ws.on("error", fail);
    ws.on("close", () => { if (!closed) fail(); });
    return {
      write(audio) {
        if (closed || finishing) return;
        if (audio.length !== 3200) throw new Error("音声チャンクの形式が不正です。");
        if (!ready) { if (queued.length >= 20) { fail(); return; } queued.push(Buffer.from(audio)); }
        else { try { process(audio); } catch { fail(); } }
      },
      finish() {
        if (finishPromise) return finishPromise;
        if (closed) return Promise.reject(new Error(failure));
        finishing = true;
        finishPromise = new Promise<void>((resolve, reject) => { finishResolve = resolve; finishReject = reject; });
        drainTimer = setTimeout(fail, 10000);
        if (ready) { commit(); drain(); }
        return finishPromise;
      },
      close,
    };
  }
}
