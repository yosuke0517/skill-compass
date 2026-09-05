"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Square, Volume2 } from "lucide-react";

const subscribe = () => () => {};
const supported = () => typeof window !== "undefined" && Boolean(window.speechSynthesis && window.SpeechSynthesisUtterance);

export function QuizReadAloud({ question, review }: { question: string[]; review?: string[] }) {
  const available = useSyncExternalStore(subscribe, supported, () => false);
  const [rate, setRate] = useState(1);
  const [reading, setReading] = useState<"question" | "review" | null>(null);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const current = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => () => {
    generation.current += 1;
    if (current.current) window.speechSynthesis?.cancel();
    current.current = null;
  }, []);

  function stop() {
    generation.current += 1;
    window.speechSynthesis.cancel();
    current.current = null;
    setReading(null);
  }

  function play(kind: "question" | "review") {
    stop();
    setError("");
    const run = generation.current;
    // Short utterances avoid long-text cutoffs on mobile speech engines.
    const chunks = (kind === "question" ? question : review ?? []).flatMap(
      (text) => text.match(/[^。！？.!?\n]{1,180}[。！？.!?]?/gu) ?? [],
    ).filter((text) => text.trim());
    setReading(kind);
    function next(index: number) {
      if (generation.current !== run) return;
      if (index >= chunks.length) {
        current.current = null;
        setReading(null);
        return;
      }
      try {
        const utterance = new SpeechSynthesisUtterance(chunks[index]);
        utterance.lang = /[\u3040-\u30ff\u3400-\u9fff]/u.test(chunks[index]) ? "ja-JP" : "en-US";
        utterance.rate = rate;
        utterance.onend = () => next(index + 1);
        utterance.onerror = () => {
          if (generation.current !== run) return;
          current.current = null;
          setReading(null);
          setError("読み上げできませんでした。もう一度再生してください。");
        };
        current.current = utterance;
        window.speechSynthesis.speak(utterance);
      } catch {
        current.current = null;
        setReading(null);
        setError("読み上げできませんでした。もう一度再生してください。");
      }
    }
    next(0);
  }

  return (
    <div className="quiz-read-aloud" aria-label="読み上げ">
      <div className="quiz-read-aloud-controls">
        <button type="button" disabled={!available} aria-pressed={reading === "question"} onClick={() => play("question")}>
          <Volume2 size={16} aria-hidden="true" />問題を聞く
        </button>
        {review && <button type="button" disabled={!available} aria-pressed={reading === "review"} onClick={() => play("review")}>
          <Volume2 size={16} aria-hidden="true" />解説を聞く
        </button>}
        {reading && <button type="button" onClick={stop}><Square size={14} aria-hidden="true" />停止</button>}
        <label>速度 <select aria-label="読み上げ速度" value={rate} disabled={!available} onChange={(event) => { if (reading) stop(); setRate(Number(event.target.value)); }}>
          {[0.75, 1, 1.25, 1.5].map((value) => <option key={value} value={value}>{value}×</option>)}
        </select></label>
      </div>
      <p role="status">{!available ? "このブラウザでは読み上げを利用できません。" : error || (reading ? "読み上げ中" : "表示中の日本語訳を優先して読みます。コード・表は画面で確認してください。")}</p>
    </div>
  );
}
