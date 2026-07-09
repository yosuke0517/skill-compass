"use client";

import { FormEvent, useState } from "react";
import { Bot, Send, Sparkles, X } from "lucide-react";

type Message = {
  role: "user" | "assistant";
  text: string;
};

const promptChips = ["この問題をやさしく説明して", "ヒントだけください", "なぜこの答え？", "日本語で要約して"];

export function TodayAssistantWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", text: "今日の問題について聞けます。迷った選択肢や、知りたい観点を送ってください。" },
  ]);
  const [pending, setPending] = useState(false);

  async function askAssistant(message: string) {
    const trimmed = message.trim();
    if (!trimmed || pending) return;

    setOpen(true);
    setInput("");
    setPending(true);
    setMessages((current) => [...current, { role: "user", text: trimmed }]);

    try {
      const response = await fetch("/api/assistant/today", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });

      if (!response.ok) {
        throw new Error("assistant request failed");
      }

      const payload = (await response.json()) as { answer?: string };
      setMessages((current) => [
        ...current,
        { role: "assistant", text: payload.answer ?? "いまは回答を作れませんでした。" },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        { role: "assistant", text: "いまは相談エージェントに接続できませんでした。少し後でもう一度試してください。" },
      ]);
    } finally {
      setPending(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void askAssistant(input);
  }

  return (
    <div className="today-assistant">
      {open ? (
        <section className="assistant-sheet" aria-label="Today assistant">
          <div className="assistant-sheet-header">
            <div>
              <p className="eyebrow">Ask anything</p>
              <strong>Today coach</strong>
            </div>
            <button type="button" className="icon-button" aria-label="Close assistant" onClick={() => setOpen(false)}>
              <X size={17} aria-hidden="true" />
            </button>
          </div>

          <div className="assistant-messages" aria-live="polite">
            {messages.map((message, index) => (
              <p key={`${message.role}-${index}`} className={message.role === "user" ? "assistant-message user" : "assistant-message"}>
                {message.text}
              </p>
            ))}
            {pending ? (
              <div className="assistant-thinking" aria-label="Assistant thinking">
                <span />
                <span />
                <span />
              </div>
            ) : null}
          </div>

          <div className="assistant-chips">
            {promptChips.map((chip) => (
              <button key={chip} type="button" onClick={() => void askAssistant(chip)} disabled={pending}>
                {chip}
              </button>
            ))}
          </div>

          <form className="assistant-form" onSubmit={handleSubmit}>
            <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="今日の問題について聞く" aria-label="Ask the Today assistant" />
            <button type="submit" aria-label="Send question" disabled={pending || input.trim().length === 0}>
              <Send size={16} aria-hidden="true" />
            </button>
          </form>
        </section>
      ) : null}

      <button type="button" className="assistant-orb" aria-label="Open Today assistant" onClick={() => setOpen((current) => !current)}>
        <span className="assistant-orb-ring" />
        <Bot size={23} aria-hidden="true" />
        <Sparkles size={12} aria-hidden="true" className="assistant-orb-spark" />
      </button>
    </div>
  );
}
