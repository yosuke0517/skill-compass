"use client";

import { CSSProperties, FormEvent, PointerEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bot, Send, Sparkles, X } from "lucide-react";
import { usePathname } from "next/navigation";

type Message = {
  role: "user" | "assistant";
  text: string;
};

const promptChips = ["この問題をやさしく説明して", "ヒントだけください", "なぜこの答え？", "日本語で要約して"];
const buttonSize = 62;
const defaultBottomGap = 92 + buttonSize;
const edgeGap = 18;
const orbBackground =
  "radial-gradient(circle at 42% 34%, #eefaff 0 12%, transparent 13%), linear-gradient(180deg, #52c7ff 0%, #2177f4 52%, #0860df 100%)";

export function TodayAssistantWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [position, setPosition] = useState<{ x: number; y: number } | null>(() =>
    typeof window === "undefined"
      ? null
      : clampPosition(window.innerWidth - buttonSize - edgeGap, window.innerHeight - defaultBottomGap),
  );
  const suppressClickRef = useRef(false);
  const dragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", text: "今日の問題について聞けます。迷った選択肢や、知りたい観点を送ってください。" },
  ]);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    function handleResize() {
      setPosition((current) =>
        current ? clampPosition(current.x, current.y) : clampPosition(window.innerWidth - buttonSize - edgeGap, window.innerHeight - defaultBottomGap),
      );
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

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

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (open || !position) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: position.x,
      startY: position.y,
      moved: false,
    };
  }

  function handlePointerMove(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const nextX = drag.startX + event.clientX - drag.startClientX;
    const nextY = drag.startY + event.clientY - drag.startClientY;
    const moved = Math.abs(event.clientX - drag.startClientX) > 4 || Math.abs(event.clientY - drag.startClientY) > 4;
    dragRef.current = { ...drag, moved: drag.moved || moved };
    setPosition(clampPosition(nextX, nextY));
  }

  function handlePointerUp(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    event.currentTarget.releasePointerCapture(event.pointerId);
    suppressClickRef.current = drag.moved;
    dragRef.current = null;
  }

  function handleOrbClick() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }

    setOpen((current) => !current);
  }

  if (pathname !== "/today" || !position || typeof document === "undefined") {
    return null;
  }

  const hostStyle: CSSProperties = open
    ? {
        bottom: "calc(92px + env(safe-area-inset-bottom))",
        height: "auto",
        left: "50%",
        maxWidth: 394,
        pointerEvents: "none",
        position: "fixed",
        right: "auto",
        top: "auto",
        transform: "translateX(-50%)",
        width: "calc(100vw - 36px)",
        zIndex: 60,
      }
    : {
        height: buttonSize,
        left: position.x,
        pointerEvents: "none",
        position: "fixed",
        top: position.y,
        width: buttonSize,
        zIndex: 60,
      };

  const orbStyle: CSSProperties = {
    alignItems: "center",
    background: orbBackground,
    border: "3px solid #9ee6ff",
    borderRadius: 999,
    boxShadow: "0 14px 30px rgb(13 91 213 / 34%), inset 0 -8px 16px rgb(3 64 177 / 24%)",
    color: "#ffffff",
    display: "inline-flex",
    flex: "0 0 auto",
    gap: 8,
    height: buttonSize,
    justifyContent: "center",
    marginLeft: "auto",
    maxHeight: buttonSize,
    maxWidth: buttonSize,
    minHeight: buttonSize,
    minWidth: buttonSize,
    padding: 0,
    pointerEvents: "auto",
    position: "relative",
    touchAction: "none",
    userSelect: "none",
    width: buttonSize,
  };

  return createPortal(
    <div className="today-assistant" data-open={open ? "true" : "false"} style={hostStyle}>
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

      <button
        type="button"
        className="assistant-orb"
        aria-label="Open Today assistant"
        style={orbStyle}
        onClick={handleOrbClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <span className="assistant-orb-ring" />
        <Bot size={23} aria-hidden="true" />
        <Sparkles size={12} aria-hidden="true" className="assistant-orb-spark" />
      </button>
    </div>,
    document.body,
  );
}

function clampPosition(x: number, y: number) {
  const maxX = window.innerWidth - buttonSize - edgeGap;
  const maxY = window.innerHeight - buttonSize - edgeGap;

  return {
    x: Math.min(Math.max(edgeGap, x), maxX),
    y: Math.min(Math.max(edgeGap, y), maxY),
  };
}
