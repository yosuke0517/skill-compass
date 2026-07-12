"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import type { TodayQuizQuestion } from "@/lib/quiz/get-today-quiz";
import type { TranslatedQuizCard } from "@/lib/translation/translate-quiz-card";

import { getNextQuestionIndex } from "./quiz-card-navigation";
import { QuizQuestionCard } from "./quiz-question-card";

type QuizCardNavigatorProps = {
  quizDayId: string;
  questions: TodayQuizQuestion[];
  translations: Record<string, TranslatedQuizCard>;
};

export function QuizCardNavigator({ quizDayId, questions, translations }: QuizCardNavigatorProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const previousActiveIndex = useRef(activeIndex);
  const activeQuestion = questions[activeIndex];
  const answeredCount = questions.filter((question) => question.answer !== null).length;
  const unansweredCount = questions.length - answeredCount;

  useEffect(() => {
    setActiveIndex((currentIndex) => Math.min(currentIndex, Math.max(questions.length - 1, 0)));
  }, [questions.length]);

  useEffect(() => {
    if (activeIndex !== previousActiveIndex.current && activeQuestion) {
      document.getElementById(`quiz-question-${activeQuestion.question.id}`)?.focus();
    }
    previousActiveIndex.current = activeIndex;
  }, [activeIndex, activeQuestion]);

  if (!activeQuestion) {
    return <p className="form-error">No quiz questions are available.</p>;
  }

  function move(direction: "next" | "previous") {
    setActiveIndex((currentIndex) => getNextQuestionIndex(currentIndex, questions.length, direction));
  }

  return (
    <section className="quiz-card-navigator" aria-label="Quiz questions">
      <div className="quiz-card-navigation-status" aria-live="polite">
        <strong>{activeIndex + 1} / {questions.length}</strong>
        <span>Question {activeIndex + 1} of {questions.length}</span>
        <span>{answeredCount} answered, {unansweredCount} unanswered</span>
      </div>

      <ol className="quiz-card-indicators" aria-label="Question status">
        {questions.map((question, index) => (
          <li key={question.question.id} aria-current={index === activeIndex ? "step" : undefined}>
            <span className={question.answer === null ? "unanswered" : "answered"}>
              Question {index + 1}: {question.answer === null ? "unanswered" : "answered"}
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
        <button type="button" aria-label="Previous question" disabled={activeIndex === 0} onClick={() => move("previous")}>
          <ChevronLeft size={18} aria-hidden="true" />
          Previous
        </button>
        <button type="button" aria-label="Next question" disabled={activeIndex === questions.length - 1} onClick={() => move("next")}>
          Next
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </nav>
    </section>
  );
}
