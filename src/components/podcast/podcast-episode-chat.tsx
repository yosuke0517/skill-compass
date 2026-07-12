"use client";

import { FormEvent, useEffect, useState } from "react";
import { Bot, MessageCircle, Send, Volume2, X } from "lucide-react";

type Message = { role: "user" | "assistant"; text: string; audioDataUrl?: string };

const prompts = ["実務のユースケースを教えて", "サンプルコードを見せて", "注意点とトレードオフは？"];

export function PodcastEpisodeChat({ episodeId, title }: { episodeId: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [voice, setVoice] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    fetch(`/api/podcast/episodes/${episodeId}/chat`).then(async (response) => {
      if (!response.ok) return;
      const data = (await response.json()) as { messages?: Message[] };
      setMessages(data.messages ?? []);
    }).catch(() => undefined);
  }, [episodeId, open]);

  async function ask(nextQuestion: string) {
    const trimmed = nextQuestion.trim();
    if (!trimmed || loading) return;
    setQuestion("");
    setError("");
    setLoading(true);
    const nextMessages = [...messages, { role: "user" as const, text: trimmed }];
    setMessages(nextMessages);
    try {
      const response = await fetch(`/api/podcast/episodes/${episodeId}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: trimmed, conversation: messages, voice }),
      });
      const data = (await response.json()) as { answer?: string; audioDataUrl?: string; error?: string };
      if (!response.ok || !data.answer) throw new Error(data.error ?? "Chat unavailable");
      setMessages([...nextMessages, { role: "assistant", text: data.answer, audioDataUrl: data.audioDataUrl }]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Chat unavailable");
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void ask(question);
  }

  return <>
    <button type="button" className="podcast-chat-trigger" onClick={() => setOpen(true)}><MessageCircle size={17} aria-hidden="true" /> Ask this episode</button>
    {open ? <div className="podcast-chat-backdrop" role="presentation" onClick={() => setOpen(false)}>
      <section className="podcast-chat-sheet" role="dialog" aria-modal="true" aria-label={`Ask about ${title}`} onClick={(event) => event.stopPropagation()}>
        <header className="podcast-chat-sheet-header"><div><span className="eyebrow">Episode coach</span><strong>Ask about this episode</strong><small>{title}</small></div><button type="button" className="podcast-chat-close" onClick={() => setOpen(false)} title="Close chat" aria-label="Close chat"><X size={20} /></button></header>
        <div className="podcast-chat-messages">{messages.length === 0 ? <p className="podcast-chat-empty">このエピソードの内容について、ユースケースやサンプルコードを質問できます。</p> : messages.map((message, index) => <div key={`${message.role}-${index}`} className={`podcast-chat-message ${message.role}`}><span>{message.role === "assistant" ? <Bot size={14} /> : "You"}</span><p>{message.text}</p>{message.audioDataUrl ? <audio controls preload="none" src={message.audioDataUrl} /> : null}</div>)}{loading ? <div className="podcast-chat-thinking" role="status"><span className="podcast-chat-thinking-dot" /><span>回答を生成中…</span></div> : null}</div>
        <div className="podcast-chat-prompts">{prompts.map((prompt) => <button type="button" key={prompt} disabled={loading} onClick={() => void ask(prompt)}>{prompt}</button>)}</div>
        <form onSubmit={submit} className="podcast-chat-form"><textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="質問を入力" rows={2} /><div className="podcast-chat-form-actions"><div className="podcast-voice-setting"><Volume2 size={15} aria-hidden="true" /><span>音声回答</span><button type="button" className={`podcast-voice-toggle${voice ? " is-active" : ""}`} role="switch" aria-checked={voice} onClick={() => setVoice((current) => !current)} title="音声回答を切り替え" aria-label={voice ? "音声回答オン" : "音声回答オフ"}><span className="podcast-voice-track"><span className="podcast-voice-knob" /></span></button></div><button type="submit" className="podcast-send-button" disabled={loading || !question.trim()} title="質問を送信" aria-label="質問を送信"><Send size={17} /></button></div></form>
        {error ? <p className="form-error" aria-live="polite">{error}</p> : null}
      </section>
    </div> : null}
  </>;
}
