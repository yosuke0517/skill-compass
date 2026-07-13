"use client";

import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import type { TodayQuizQuestion } from "@/lib/quiz/get-today-quiz";
import type { TranslatedQuizCard } from "@/lib/translation/translate-quiz-card";

import { TodayAssistantWidget } from "@/components/assistant/today-assistant-widget";

import { getClampedQuestionIndex, getNextQuestionIndex } from "./quiz-card-navigation";
import { QuizQuestionCard } from "./quiz-question-card";

type QuizCardNavigatorProps = {
  quizDayId: string;
  questions: TodayQuizQuestion[];
  translations: Record<string, TranslatedQuizCard>;
  navigatorAction?: ReactNode;
  error?: string;
};

const interactiveDescendantSelector = [
  "a",
  "button",
  "input",
  "textarea",
  "select",
  "label",
  "summary",
  "[contenteditable]",
  "[role='button']",
  "[role='link']",
  "[role='textbox']",
  "[role='checkbox']",
  "[role='radio']",
  "[role='switch']",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

function getPendingAnswerStorageKey(quizDayId: string) {
  return `skill-compass:pending-quiz-answer:${quizDayId}`;
}

export function QuizCardNavigator({
  quizDayId,
  questions,
  translations,
  navigatorAction,
  error,
}: QuizCardNavigatorProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const activeIndex = getClampedQuestionIndex(selectedIndex, questions.length);
  const previousActiveIndex = useRef(activeIndex);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const activeCardFocusRef = useRef<HTMLHeadingElement>(null);
  const activeQuestion = questions[activeIndex];
  const answeredCount = questions.filter((question) => question.answer !== null).length;
  const unansweredCount = questions.length - answeredCount;
  const nextIndex = getNextQuestionIndex(activeIndex, questions);
  const hasNextTarget = nextIndex !== activeIndex;

  useEffect(() => {
    if (selectedIndex === activeIndex) return;

    const frame = requestAnimationFrame(() => setSelectedIndex(activeIndex));
    return () => cancelAnimationFrame(frame);
  }, [activeIndex, selectedIndex]);

  useEffect(() => {
    if (activeIndex !== previousActiveIndex.current && activeQuestion) {
      activeCardFocusRef.current?.focus();
    }
    previousActiveIndex.current = activeIndex;
  }, [activeIndex, activeQuestion]);

  useEffect(() => {
    if (error) {
      window.sessionStorage.removeItem(getPendingAnswerStorageKey(quizDayId));
      return;
    }

    const pendingQuestionId = window.sessionStorage.getItem(getPendingAnswerStorageKey(quizDayId));
    if (!pendingQuestionId) return;

    window.sessionStorage.removeItem(getPendingAnswerStorageKey(quizDayId));
    const submittedIndex = questions.findIndex(
      (question) => question.question.id === pendingQuestionId,
    );
    if (submittedIndex < 0) return;

    const nextUnansweredIndex = questions.findIndex(
      (question, index) => index > submittedIndex && question.answer === null,
    );
    const frame = requestAnimationFrame(() => {
      setSelectedIndex(nextUnansweredIndex >= 0 ? nextUnansweredIndex : submittedIndex);
    });
    return () => cancelAnimationFrame(frame);
  }, [error, quizDayId, questions]);

  if (!activeQuestion) {
    return <p className="form-error">No quiz questions are available.</p>;
  }

  function goTo(index: number) {
    setSelectedIndex(getClampedQuestionIndex(index, questions.length));
  }

  function goToNext() {
    goTo(nextIndex);
  }

  function handleAnswerSubmit(questionId: string) {
    window.sessionStorage.setItem(getPendingAnswerStorageKey(quizDayId), questionId);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (
      event.target instanceof HTMLElement &&
      (event.target.isContentEditable || event.target.closest("input, textarea, select"))
    )
      return;

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goTo(activeIndex - 1);
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      goToNext();
    }
  }

  function handlePointerDown(event: PointerEvent<HTMLElement>) {
    if (isInteractiveDescendant(event.target, event.currentTarget)) {
      pointerStart.current = null;
      return;
    }

    pointerStart.current = { x: event.clientX, y: event.clientY };
  }

  function handlePointerUp(event: PointerEvent<HTMLElement>) {
    const start = pointerStart.current;
    pointerStart.current = null;

    if (!start || isInteractiveDescendant(event.target, event.currentTarget)) return;

    const horizontalDistance = event.clientX - start.x;
    const verticalDistance = event.clientY - start.y;

    if (
      Math.abs(horizontalDistance) <= 56 ||
      Math.abs(horizontalDistance) <= Math.abs(verticalDistance)
    )
      return;

    if (horizontalDistance < 0) {
      goToNext();
      return;
    }

    goTo(activeIndex - 1);
  }

  return (
    <section
      className="quiz-card-navigator"
      aria-label="Quiz questions"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        pointerStart.current = null;
      }}
    >
      <div className="quiz-card-navigation-status" aria-live="polite">
        <strong>
          {activeIndex + 1} / {questions.length}
        </strong>
        <span>
          Question {activeIndex + 1} of {questions.length}
        </span>
        <span>
          {answeredCount} answered, {unansweredCount} unanswered
        </span>
      </div>

      <ol className="quiz-card-indicators" aria-label="Question status">
        {questions.map((question, index) => (
          <li key={question.question.id} aria-current={index === activeIndex ? "step" : undefined}>
            <button
              type="button"
              className={question.answer === null ? "unanswered" : "answered"}
              aria-label={`Go to question ${index + 1}, ${question.answer === null ? "unanswered" : "answered"}`}
              aria-pressed={index === activeIndex}
              title={`Go to question ${index + 1}`}
              onClick={() => goTo(index)}
            >
              {index + 1}
            </button>
          </li>
        ))}
      </ol>

      <div className="quiz-card-slot">
        <QuizQuestionCard
          quizDayId={quizDayId}
          item={activeQuestion}
          translation={translations[activeQuestion.question.id]}
          isActive
          activeCardFocusRef={activeCardFocusRef}
          onAnswerSubmit={handleAnswerSubmit}
        />
      </div>

      {navigatorAction}

      <nav className="quiz-card-controls" aria-label="Question navigation">
        <button
          type="button"
          aria-label="Previous question"
          disabled={activeIndex === 0}
          onClick={() => goTo(activeIndex - 1)}
        >
          <ChevronLeft size={18} aria-hidden="true" />
          Previous
        </button>
        <button
          type="button"
          aria-label="Next question"
          disabled={!hasNextTarget}
          onClick={goToNext}
        >
          Next
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </nav>

      <TodayAssistantWidget
        key={activeQuestion.question.id}
        questionId={activeQuestion.question.id}
      />
    </section>
  );
}

function isInteractiveDescendant(target: EventTarget | null, container?: Element) {
  if (!(target instanceof Element)) return false;

  const interactiveElement = target.closest(interactiveDescendantSelector);
  return interactiveElement !== null && interactiveElement !== container;
}
