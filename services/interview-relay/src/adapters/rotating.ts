import type { SpeechAdapter, Source, Event, SpeechStream } from "../shared.js";
type Leg = {
  stream: SpeechStream;
  events: Event[];
  done: boolean;
  timer?: ReturnType<typeof setTimeout>;
};
// Exact audio partition: half-close the old writable stream, keep receiving its
// final results while a new stream accepts live audio. Preserve result order.
export class RotatingSpeech implements SpeechAdapter {
  constructor(
    private adapter: SpeechAdapter,
    private interval = 240000,
    private drainTimeout = 15000,
  ) {}
  open(source: Source, emit: (event: Event) => void): SpeechStream {
    let closed = false;
    const legs: Leg[] = [];
    let timer: ReturnType<typeof setInterval> | undefined;
    const close = () => {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      timer = undefined;
      for (const leg of legs) {
        clearTimeout(leg.timer);
        leg.events = [];
        leg.stream?.close();
      }
      legs.length = 0;
    };
    const fail = (message: string) => {
      if (closed) return;
      emit({ type: "error", message });
      close();
    };
    const flush = () => {
      while (!closed && legs.length) {
        const first = legs[0];
        for (const event of first.events.splice(0)) {
          if (closed) break;
          emit(event);
        }
        if (!first.done) break;
        clearTimeout(first.timer);
        first.stream.close();
        legs.shift();
      }
    };
    const open = () => {
      const leg = { events: [], done: false } as unknown as Leg;
      legs.push(leg);
      leg.stream = this.adapter.open(source, (event) => {
        if (closed || leg.done) return;
        if (event.type === "error") {
          fail(event.message);
          return;
        }
        leg.events.push(event);
        if (leg.events.length > 200) {
          fail("音声の確定応答が滞留しました。停止して再接続してください。");
          return;
        }
        flush();
      });
      return leg;
    };
    let current = open();
    timer = setInterval(() => {
      if (closed) return;
      const previous = current;
      if (!previous.stream.finish) {
        fail("音声アダプターが確定終了に対応していません。");
        return;
      }
      try {
        current = open();
        previous.timer = setTimeout(
          () =>
            fail(
              "更新前の音声を確定できませんでした。文字起こしが欠ける可能性があるため停止します。再接続してください。",
            ),
          this.drainTimeout,
        );
        // finish ends audio input only. Data listeners remain until final/end.
        void previous.stream.finish().then(
          () => {
            if (closed) return;
            previous.done = true;
            flush();
            if (!closed) emit({ type: "status", state: "rotated" });
          },
          () => fail("更新前の音声確定に失敗しました。停止して再接続してください。"),
        );
      } catch {
        fail("音声ストリームの更新に失敗しました。再接続してください。");
      }
    }, this.interval);
    return {
      write(buffer) {
        if (!closed) current.stream.write(buffer);
      },
      close,
    };
  }
}
