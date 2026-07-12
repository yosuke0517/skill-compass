"use client";

import { type RefObject, useState, useTransition } from "react";
import { CheckCircle2, CircleHelp, Languages } from "lucide-react";

import { submitQuizAnswerAction } from "@/app/actions/quiz";
import type { TodayQuizQuestion } from "@/lib/quiz/get-today-quiz";
import type { TranslatedQuizCard } from "@/lib/translation/translate-quiz-card";

import { ConfidenceInput } from "./confidence-input";
import { QuizTranslationPanel } from "./quiz-translation-panel";

type QuizQuestionCardProps = {
  quizDayId: string;
  item: TodayQuizQuestion;
  translation?: TranslatedQuizCard;
  isActive?: boolean;
  activeCardFocusRef?: RefObject<HTMLHeadingElement | null>;
  onAnswerSubmit?: (questionId: string) => void;
};

const reasonLabels: Record<string, string> = {
  weakness: "Weakness",
  strength_extension: "Stretch",
  latest_catchup: "Catch-up",
  balancing: "Balance",
  fallback: "Fallback",
};

export function QuizQuestionCard({
  quizDayId,
  item,
  translation,
  isActive = false,
  activeCardFocusRef,
  onAnswerSubmit,
}: QuizQuestionCardProps) {
  const answered = item.answer !== null;
  const correctChoice = item.question.choices.find((choice) => choice.correct);
  const [translationState, setTranslationState] = useState({
    questionId: item.question.id,
    value: translation,
  });
  const [isTranslating, startTranslating] = useTransition();
  const currentTranslation = translationState.questionId === item.question.id ? translationState.value : translation;

  function handleTranslate() {
    startTranslating(async () => {
      try {
        const response = await fetch("/api/quiz/translation", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ questionId: item.question.id }),
        });
        if (!response.ok) {
          throw new Error("translation request failed");
        }
        const translated = (await response.json()) as TranslatedQuizCard;
        setTranslationState({ questionId: item.question.id, value: translated });
      } catch {
        setTranslationState({
          questionId: item.question.id,
          value: {
            questionId: item.question.id,
            prompt: null,
            choices: item.question.choices.map((choice) => ({ id: choice.id, label: null })),
            feedback: null,
            unavailable: true,
          },
        });
      }
    });
  }

  return (
    <article className={`quiz-card${answered ? " answered" : ""}`} aria-current={isActive ? "step" : undefined}>
      <div className="quiz-card-header">
        <div className="quiz-card-meta">
          <span>#{item.slot}</span>
          <strong>{reasonLabels[item.reason] ?? item.reason}</strong>
        </div>
        <button
          type="button"
          className="icon-button"
          title="Translate to Japanese"
          aria-label="Translate to Japanese"
          aria-busy={isTranslating}
          disabled={isTranslating}
          onClick={handleTranslate}
        >
          <Languages size={17} aria-hidden="true" />
        </button>
      </div>
      <h2 ref={activeCardFocusRef} id={`quiz-question-${item.question.id}`} tabIndex={-1}>{item.question.prompt}</h2>
      {isTranslating ? (
        <div className="translation-loading" aria-label="Translation loading" aria-live="polite">
          <span />
          <span />
          <span />
        </div>
      ) : null}
      {currentTranslation ? <QuizTranslationPanel translation={currentTranslation} /> : null}

      {answered ? (
        <>
          <section className="answer-review" aria-label="Answer review">
            <div className="answer-review-summary">
              <span>Your answer</span>
              <strong>{item.question.choices.find((choice) => choice.id === item.answer?.selectedChoiceId)?.label ?? "Unknown choice"}</strong>
            </div>
            <div className="answer-review-summary correct">
              <span>Correct answer</span>
              <strong>{correctChoice?.label ?? "Not configured"}</strong>
            </div>

            <div className="answered-choice-list">
              {item.question.choices.map((choice, index) => {
                const selected = choice.id === item.answer?.selectedChoiceId;
                const correct = choice.correct;

                return (
                  <div key={choice.id} className={`answered-choice${selected ? " selected" : ""}${correct ? " correct" : ""}`}>
                    <span className="answered-choice-marker" aria-hidden="true">
                      {correct ? <CheckCircle2 size={16} /> : index + 1}
                    </span>
                    <p>{choice.label}</p>
                    <div className="answered-choice-badges">
                      {selected ? <span className="answer-badge selected">Your answer</span> : null}
                      {correct ? <span className="answer-badge correct">Correct</span> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="answer-feedback">
            {item.answer?.correct ? <CheckCircle2 size={20} aria-hidden="true" /> : <CircleHelp size={20} aria-hidden="true" />}
            <div>
              <p>{item.answer?.correct ? "Correct" : "Review"}</p>
              <span>{item.answer?.feedback}</span>
            </div>
          </div>
        </>
      ) : (
        <form action={submitQuizAnswerAction} className="quiz-form" onSubmit={() => onAnswerSubmit?.(item.question.id)}>
          <input type="hidden" name="quizDayId" value={quizDayId} />
          <input type="hidden" name="questionId" value={item.question.id} />

          <div className="choice-list">
            {item.question.choices.map((choice) => (
              <label key={choice.id}>
                <input type="radio" name="selectedChoiceId" value={choice.id} required />
                <span>{choice.label}</span>
              </label>
            ))}
          </div>

          <ConfidenceInput />

          <label className="reasoning-field">
            <span>Reasoning <small>(optional)</small></span>
            <textarea name="reasoning" rows={3} placeholder="Why does this answer fit the source?" />
          </label>

          <button type="submit">Submit answer</button>
        </form>
      )}
    </article>
  );
}
