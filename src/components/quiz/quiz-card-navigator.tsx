"use client";

import { type PointerEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import type { TodayQuizQuestion } from "@/lib/quiz/get-today-quiz";
import type { TranslatedQuizCard } from "@/lib/translation/translate-quiz-card";

import { TodayAssistantWidget } from "@/components/assistant/today-assistant-widget";

import { getClampedQuestionIndex } from "./quiz-card-navigation";
import { QuizQuestionCard } from "./quiz-question-card";

type QuizCardNavigatorProps = {
  quizDayId: string;
  questions: TodayQuizQuestion[];
  translations: Record<string, TranslatedQuizCard>;
};

export function QuizCardNavigator({ quizDayId, questions, translations }: QuizCardNavigatorProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const activeIndex = getClampedQuestionIndex(selectedIndex, questions.length);
  const previousActiveIndex = useRef(activeIndex);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const activeQuestion = questions[activeIndex];
  const answeredCount = questions.filter((question) => question.answer !== null).length;
  const unansweredCount = questions.length - answeredCount;

  useEffect(() => {
    if (selectedIndex === activeIndex) return;

    const frame = requestAnimationFrame(() => setSelectedIndex(activeIndex));
    return () => cancelAnimationFrame(frame);
  }, [activeIndex, selectedIndex]);

  useEffect(() => {
    if (activeIndex !== previousActiveIndex.current && activeQuestion) {
      document.getElementById(`quiz-question-${activeQuestion.question.id}`)?.focus();
    }
    previousActiveIndex.current = activeIndex;
  }, [activeIndex, activeQuestion]);

  if (!activeQuestion) {
    return <p className="form-error">No quiz questions are available.</p>;
  }

  function goTo(index: number) {
    setSelectedIndex(getClampedQuestionIndex(index, questions.length));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])")) return;

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goTo(activeIndex - 1);
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      goTo(activeIndex + 1);
    }
  }

  function handlePointerDown(event: PointerEvent<HTMLElement>) {
    pointerStart.current = { x: event.clientX, y: event.clientY };
  }

  function handlePointerUp(event: PointerEvent<HTMLElement>) {
    const start = pointerStart.current;
    pointerStart.current = null;

    if (!start) return;

    const horizontalDistance = event.clientX - start.x;
    const verticalDistance = event.clientY - start.y;

    if (Math.abs(horizontalDistance) <= 56 || Math.abs(horizontalDistance) <= Math.abs(verticalDistance)) return;

    goTo(activeIndex + (horizontalDistance < 0 ? 1 : -1));
  }

  return (
    <section
      className="quiz-card-navigator"
      aria-label="Quiz questions"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => { pointerStart.current = null; }}
    >
      <div className="quiz-card-navigation-status" aria-live="polite">
        <strong>{activeIndex + 1} / {questions.length}</strong>
        <span>Question {activeIndex + 1} of {questions.length}</span>
        <span>{answeredCount} answered, {unansweredCount} unanswered</span>
      </div>

      <ol className="quiz-card-indicators" aria-label="Question status">
        {questions.map((question, index) => (
          <li key={question.question.id} aria-current={index === activeIndex ? "step" : undefined}>
            <span
              className={question.answer === null ? "unanswered" : "answered"}
              aria-label={`Question ${index + 1}: ${question.answer === null ? "unanswered" : "answered"}`}
            >
              {index + 1}
            </span>
          </li>
        ))}
      </ol>

      <QuizQuestionCard
        key={activeQuestion.question.id}
        quizDayId={quizDayId}
        item={activeQuestion}
        translation={translations[activeQuestion.question.id]}
        isActive
      />

      <nav className="quiz-card-controls" aria-label="Question navigation">
        <button type="button" aria-label="Previous question" disabled={activeIndex === 0} onClick={() => goTo(activeIndex - 1)}>
          <ChevronLeft size={18} aria-hidden="true" />
          Previous
        </button>
        <button type="button" aria-label="Next question" disabled={activeIndex === questions.length - 1} onClick={() => goTo(activeIndex + 1)}>
          Next
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </nav>

      <TodayAssistantWidget questionId={activeQuestion.question.id} />
    </section>
  );
}
