import { v2 } from "@google-cloud/speech";
import type { SpeechAdapter, Source, Event } from "../shared.js";
export class GoogleSpeech implements SpeechAdapter {
  private client: v2.SpeechClient;
  constructor(
    private project: string,
    private location: string,
    private model: string,
    client?: v2.SpeechClient,
  ) {
    for (const value of [project, location, model])
      if (!/^[a-zA-Z0-9._-]+$/.test(value)) throw new Error("Google音声設定を確認してください。");
    this.client =
      client ??
      new v2.SpeechClient({
        apiEndpoint:
          location === "global" ? "speech.googleapis.com" : `${location}-speech.googleapis.com`,
      });
  }
  open(source: Source, emit: (event: Event) => void) {
    const stream = this.client._streamingRecognize();
    let closed = false,
      finishing = false;
    let finishResolve: (() => void) | undefined, finishReject: ((error: Error) => void) | undefined;
    let finishPromise: Promise<void> | undefined;
    const finalOffsets = new Set<string>();
    const pending: Buffer[] = [];
    let pendingBytes = 0, blocked = false, inputEnded = false;
    const endInput = () => {
      if (inputEnded) return;
      inputEnded = true;
      stream.end();
    };
    let drainTimer: ReturnType<typeof setTimeout> | undefined;
    const write = (audio: Buffer) => {
      // false means accepted into the writable buffer, not a failed write.
      if (!stream.write({ audio })) {
        blocked = true;
        drainTimer = setTimeout(() => {
          if (closed) return;
          const message = "音声送信の待機が2秒を超えました。再接続してください。";
          if (finishing) finishReject?.(new Error(message));
          else emit({ type: "error", message });
        }, 2000);
      }
    };
    stream.on("drain", () => {
      if (closed) return;
      clearTimeout(drainTimer);
      blocked = false;
      try {
        while (pending.length && !blocked) {
          const audio = pending.shift()!;
          pendingBytes -= audio.length;
          write(audio);
        }
        if (finishing && !pending.length) endInput();
      } catch {
        const message = "音声送信を再開できませんでした。再接続してください。";
        if (finishing) finishReject?.(new Error(message));
        else emit({ type: "error", message });
      }
    });
    stream.on("data", (response) => {
      if (closed) return;
      for (const result of response.results ?? []) {
        const text = result.alternatives?.[0]?.transcript;
        const offset = result.resultEndOffset;
        const key = offset ? `${offset.seconds ?? 0}:${offset.nanos ?? 0}` : undefined;
        if (result.isFinal && key) {
          if (finalOffsets.has(key)) continue;
          finalOffsets.add(key);
        }
        if (text) emit({ type: "transcript", source, text, final: !!result.isFinal });
      }
    });
    stream.on("error", () => {
      if (finishing) {
        finishReject?.(new Error("音声認識の確定に失敗しました。"));
        return;
      }
      if (!closed)
        emit({
          type: "error",
          message: "音声認識接続が終了しました。接続設定を確認し、再接続してください。",
        });
    });
    stream.on("end", () => {
      if (finishing) {
        finishResolve?.();
        return;
      }
      if (!closed)
        emit({ type: "error", message: "音声認識ストリームが終了しました。再接続してください。" });
    });
    stream.write({
      recognizer: `projects/${this.project}/locations/${this.location}/recognizers/_`,
      streamingConfig: {
        config: {
          explicitDecodingConfig: {
            encoding: "LINEAR16",
            sampleRateHertz: 16000,
            audioChannelCount: 1,
          },
          languageCodes: ["ja-JP"],
          model: this.model,
        },
        streamingFeatures: { interimResults: true },
      },
    });
    return {
      write(audio: Buffer) {
        if (closed || finishing) return;
        if (audio.length > 24000 || audio.length % 2)
          throw new Error("音声チャンクの形式が不正です。");
        if (blocked) {
          if (pendingBytes + audio.length > 64000)
            throw new Error("音声送信が追いつきません。再接続してください。");
          pending.push(audio);
          pendingBytes += audio.length;
        } else write(audio);
      },
      finish() {
        if (finishPromise) return finishPromise;
        if (closed) return Promise.reject(new Error("音声接続は終了済みです。"));
        finishing = true;
        finishPromise = new Promise<void>((resolve, reject) => {
          finishResolve = resolve;
          finishReject = reject;
          if (!pending.length) endInput();
        });
        return finishPromise;
      },
      close() {
        if (closed) return;
        finishResolve?.();
        closed = true;
        clearTimeout(drainTimer);
        pending.length = 0;
        pendingBytes = 0;
        stream.cancel();
        stream.destroy();
      },
    };
  }
}
