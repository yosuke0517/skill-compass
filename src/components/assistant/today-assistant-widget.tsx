"use client";

import { CSSProperties, FormEvent, PointerEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bot, Send, Sparkles, X } from "lucide-react";

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
const sheetStyle: CSSProperties = {
  background: "#ffffff",
  border: "1px solid #c9d9ff",
  borderRadius: 24,
  boxShadow: "0 22px 54px rgb(20 40 78 / 22%)",
  display: "grid",
  gap: 12,
  maxHeight: "min(70svh, 560px)",
  overflow: "hidden",
  padding: 14,
  pointerEvents: "auto",
};
const sheetHeaderStyle: CSSProperties = {
  alignItems: "center",
  display: "flex",
  justifyContent: "space-between",
};
const closeButtonStyle: CSSProperties = {
  alignItems: "center",
  background: "#edf3f1",
  border: 0,
  borderRadius: 999,
  color: "#0b5c4e",
  display: "inline-flex",
  height: 38,
  justifyContent: "center",
  minHeight: 38,
  padding: 0,
  width: 38,
};
const messagesStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  maxHeight: 260,
  overflow: "auto",
  paddingRight: 2,
};
const assistantMessageStyle: CSSProperties = {
  background: "#edf3f1",
  borderRadius: "16px 16px 16px 6px",
  color: "#2c3935",
  fontSize: "0.9rem",
  lineHeight: 1.5,
  margin: 0,
  padding: "10px 12px",
};
const userMessageStyle: CSSProperties = {
  ...assistantMessageStyle,
  background: "#155ddb",
  borderRadius: "16px 16px 6px 16px",
  color: "#ffffff",
  justifySelf: "end",
  maxWidth: "88%",
};
const chipsStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  overflowX: "auto",
  paddingBottom: 2,
};
const chipButtonStyle: CSSProperties = {
  background: "#eef4ff",
  border: 0,
  borderRadius: 999,
  color: "#1553bd",
  flex: "0 0 auto",
  fontSize: "0.8rem",
  fontWeight: 650,
  minHeight: 36,
  padding: "0 12px",
};
const formStyle: CSSProperties = {
  alignItems: "center",
  background: "#f6f8fb",
  border: "1px solid #d7dfdc",
  borderRadius: 18,
  display: "grid",
  gap: 8,
  gridTemplateColumns: "1fr auto",
  padding: 8,
};
const inputStyle: CSSProperties = {
  background: "transparent",
  border: 0,
  color: "#111816",
  lineHeight: 1.35,
  maxHeight: 74,
  minHeight: 38,
  minWidth: 0,
  outline: 0,
  padding: "0 8px",
  resize: "none",
};
const sendButtonStyle: CSSProperties = {
  alignItems: "center",
  background: "#0f7b68",
  border: 0,
  borderRadius: 999,
  color: "#ffffff",
  display: "inline-flex",
  height: 38,
  justifyContent: "center",
  minHeight: 38,
  padding: 0,
  width: 38,
};
const thinkingStyle: CSSProperties = {
  background: "#edf3f1",
  borderRadius: 16,
  display: "grid",
  gap: 7,
  justifySelf: "start",
  padding: "11px 12px",
  width: "72%",
};
const thinkingLineStyle: CSSProperties = {
  background: "linear-gradient(90deg, #dfe9e5 0%, #f8fbfa 48%, #dfe9e5 100%)",
  backgroundSize: "220% 100%",
  borderRadius: 999,
  display: "block",
  height: 9,
};

type AssistantViewport = {
  width: number;
  height: number;
  offsetLeft: number;
  offsetTop: number;
};

export function TodayAssistantWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
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
    const frame = requestAnimationFrame(() => {
      setPosition((current) =>
        current
          ? clampAssistantPosition(current, getAssistantViewport())
          : calculateAssistantDefaultPosition(getAssistantViewport()),
      );
    });

    function handleResize() {
      setPosition((current) =>
        current
          ? clampAssistantPosition(current, getAssistantViewport())
          : calculateAssistantDefaultPosition(getAssistantViewport()),
      );
    }

    window.addEventListener("resize", handleResize);
    window.visualViewport?.addEventListener("resize", handleResize);
    window.visualViewport?.addEventListener("scroll", handleResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", handleResize);
      window.visualViewport?.removeEventListener("resize", handleResize);
      window.visualViewport?.removeEventListener("scroll", handleResize);
    };
  }, []);

  async function askAssistant(message: string) {
    const trimmed = message.trim();
    if (!trimmed || pending) return;

    setOpen(true);
    setInput("");
    setPending(true);
    const nextMessages: Message[] = [...messages, { role: "user", text: trimmed }];
    setMessages(nextMessages);

    try {
      const response = await fetch("/api/assistant/today", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          messages: nextMessages,
        }),
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
    setPosition(clampAssistantPosition({ x: nextX, y: nextY }, getAssistantViewport()));
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

  if (!position || typeof document === "undefined") {
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
        <section className="assistant-sheet" aria-label="Today assistant" style={sheetStyle}>
          <div className="assistant-sheet-header" style={sheetHeaderStyle}>
            <div>
              <p className="eyebrow">Ask anything</p>
              <strong>Today coach</strong>
            </div>
            <button type="button" className="icon-button" aria-label="Close assistant" style={closeButtonStyle} onClick={() => setOpen(false)}>
              <X size={17} aria-hidden="true" />
            </button>
          </div>

          <div className="assistant-messages" aria-live="polite" style={messagesStyle}>
            {messages.map((message, index) => (
              <p
                key={`${message.role}-${index}`}
                className={message.role === "user" ? "assistant-message user" : "assistant-message"}
                style={message.role === "user" ? userMessageStyle : assistantMessageStyle}
              >
                {message.text}
              </p>
            ))}
            {pending ? (
              <div className="assistant-thinking" aria-label="Assistant thinking" style={thinkingStyle}>
                <span style={thinkingLineStyle} />
                <span style={{ ...thinkingLineStyle, width: "70%" }} />
                <span style={{ ...thinkingLineStyle, width: "84%" }} />
              </div>
            ) : null}
          </div>

          <div className="assistant-chips" style={chipsStyle}>
            {promptChips.map((chip) => (
              <button key={chip} type="button" style={chipButtonStyle} onClick={() => void askAssistant(chip)} disabled={pending}>
                {chip}
              </button>
            ))}
          </div>

          <form className="assistant-form" style={formStyle} onSubmit={handleSubmit}>
            <textarea
              value={input}
              rows={1}
              style={inputStyle}
              onChange={(event) => setInput(event.target.value)}
              placeholder="今日の問題について聞く"
              aria-label="Ask the Today assistant"
            />
            <button type="submit" aria-label="Send question" style={sendButtonStyle} disabled={pending || input.trim().length === 0}>
              <Send size={16} aria-hidden="true" />
            </button>
          </form>
        </section>
      ) : null}

      {!open ? (
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
      ) : null}
    </div>,
    document.body,
  );
}

export function calculateAssistantDefaultPosition(viewport: AssistantViewport) {
  return clampAssistantPosition(
    {
      x: viewport.offsetLeft + viewport.width - buttonSize - edgeGap,
      y: viewport.offsetTop + viewport.height - defaultBottomGap,
    },
    viewport,
  );
}

export function clampAssistantPosition(position: { x: number; y: number }, viewport: AssistantViewport) {
  const minX = viewport.offsetLeft + edgeGap;
  const minY = viewport.offsetTop + edgeGap;
  const maxX = viewport.offsetLeft + viewport.width - buttonSize - edgeGap;
  const maxY = viewport.offsetTop + viewport.height - buttonSize - edgeGap;

  return {
    x: Math.min(Math.max(minX, position.x), maxX),
    y: Math.min(Math.max(minY, position.y), maxY),
  };
}

function getAssistantViewport(): AssistantViewport {
  const viewport = window.visualViewport;
  return {
    width: viewport?.width ?? window.innerWidth,
    height: viewport?.height ?? window.innerHeight,
    offsetLeft: viewport?.offsetLeft ?? 0,
    offsetTop: viewport?.offsetTop ?? 0,
  };
}
