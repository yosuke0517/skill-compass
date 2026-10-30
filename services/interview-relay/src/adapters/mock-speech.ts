import type { SpeechAdapter } from "../shared.js";
/** Deterministic fixture, never speech recognition. UI always labels this mode as sample. */
export class MockSpeech implements SpeechAdapter {
  open(source: Parameters<SpeechAdapter["open"]>[0], emit: Parameters<SpeechAdapter["open"]>[1]) {
    let chunks = 0,
      closed = false;
    return {
      write() {
        if (closed) return;
        chunks++;
        if (chunks === 5)
          emit({
            type: "transcript",
            source,
            text: "困難な課題を…（音声イベントのサンプル）",
            final: false,
          });
        if (chunks === 10)
          emit({
            type: "transcript",
            source,
            text: "困難な課題を解決した経験を教えてください。（音声イベントのサンプル）",
            final: true,
          });
      },
      close() {
        closed = true;
      },
      async finish() {},
    };
  }
}
