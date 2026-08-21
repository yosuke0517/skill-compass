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

import type { WebAnsweredQuizQuestion, WebTodayQuizQuestion } from "@/lib/quiz/web-today-quiz";
import type { TranslatedQuizCard } from "@/lib/translation/translate-quiz-card";

import { TodayAssistantWidget } from "@/components/assistant/today-assistant-widget";

import { getClampedQuestionIndex, getNextQuestionIndex } from "./quiz-card-navigation";
import { QuizQuestionCard } from "./quiz-question-card";

type QuizCardNavigatorProps = {
  quizDayId: string;
  questions: WebTodayQuizQuestion[];
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

export function QuizCardNavigator({
  quizDayId,
  questions,
  translations,
  navigatorAction,
}: QuizCardNavigatorProps) {
  const [currentQuestions, setCurrentQuestions] = useState(questions);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const activeIndex = getClampedQuestionIndex(selectedIndex, currentQuestions.length);
  const previousActiveIndex = useRef(activeIndex);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const activeCardFocusRef = useRef<HTMLHeadingElement>(null);
  const activeCardSlotRef = useRef<HTMLDivElement>(null);
  const shouldScrollToActiveCard = useRef(false);
  const [resultMotionQuestionId, setResultMotionQuestionId] = useState<string | null>(null);
  const activeQuestion = currentQuestions[activeIndex];
  const answeredCount = currentQuestions.filter((question) => question.status === "answered").length;
  const unansweredCount = currentQuestions.length - answeredCount;
  const nextIndex = getNextQuestionIndex(activeIndex, currentQuestions);
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
    if (shouldScrollToActiveCard.current && activeQuestion) {
      shouldScrollToActiveCard.current = false;
      activeCardSlotRef.current?.scrollIntoView({
        block: "start",
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
          ? "auto"
          : "smooth",
      });
    }
    previousActiveIndex.current = activeIndex;
  }, [activeIndex, activeQuestion, resultMotionQuestionId]);

  useEffect(() => {
    if (!resultMotionQuestionId) return;

    const timeout = window.setTimeout(() => setResultMotionQuestionId(null), 1_550);
    return () => window.clearTimeout(timeout);
  }, [resultMotionQuestionId]);

  useEffect(() => {
    if (!resultMotionQuestionId) return;

    const timeout = window.setTimeout(() => setResultMotionQuestionId(null), 1_550);
    return () => window.clearTimeout(timeout);
  }, [resultMotionQuestionId]);

  if (!activeQuestion) {
    return <p className="form-error">No quiz questions are available.</p>;
  }

  function goTo(index: number) {
    const targetIndex = getClampedQuestionIndex(index, currentQuestions.length);
    if (targetIndex === activeIndex) return;

    shouldScrollToActiveCard.current = true;
    setResultMotionQuestionId(null);
    setSelectedIndex(targetIndex);
  }

  function goToNext() {
    goTo(nextIndex);
  }

  function handleAnswerSuccess(answeredItem: WebAnsweredQuizQuestion) {
    setCurrentQuestions((items) =>
      items.map((item) =>
        item.question.id === answeredItem.question.id ? answeredItem : item,
      ),
    );
    shouldScrollToActiveCard.current = true;
    setResultMotionQuestionId(answeredItem.question.id);
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
          {activeIndex + 1} / {currentQuestions.length}
        </strong>
        <span>
          Question {activeIndex + 1} of {currentQuestions.length}
        </span>
        <span>
          {answeredCount} answered, {unansweredCount} unanswered
        </span>
      </div>

      <ol className="quiz-card-indicators" aria-label="Question status">
        {currentQuestions.map((question, index) => (
          <li key={question.question.id} aria-current={index === activeIndex ? "step" : undefined}>
            <button
              type="button"
              className={question.status}
              aria-label={`Go to question ${index + 1}, ${question.status}`}
              aria-pressed={index === activeIndex}
              title={`Go to question ${index + 1}`}
              onClick={() => goTo(index)}
            >
              {index + 1}
            </button>
          </li>
        ))}
      </ol>

      <div className="quiz-card-slot" ref={activeCardSlotRef}>
        <QuizQuestionCard
          key={activeQuestion.question.id}
          quizDayId={quizDayId}
          item={activeQuestion}
          translation={translations[activeQuestion.question.id]}
          isActive
          activeCardFocusRef={activeCardFocusRef}
          onAnswerSuccess={handleAnswerSuccess}
          resultMotion={
            resultMotionQuestionId === activeQuestion.question.id &&
            activeQuestion.status === "answered" &&
            activeQuestion.answer.correct !== null
              ? activeQuestion.answer.correct
                ? "correct"
                : "incorrect"
              : undefined
          }
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
