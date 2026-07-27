"use client";

import { type RefObject, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { CheckCircle2, CircleHelp, Languages } from "lucide-react";

import { submitQuizAnswerAction } from "@/app/actions/quiz";
import type { WebTodayQuizQuestion } from "@/lib/quiz/web-today-quiz";
import type { TranslatedQuizCard } from "@/lib/translation/translate-quiz-card";

import { ConfidenceInput } from "./confidence-input";
import { QuestionArtifacts } from "./question-artifacts";
import { QuizTranslationPanel } from "./quiz-translation-panel";

type QuizQuestionCardProps = {
  quizDayId: string;
  item: WebTodayQuizQuestion;
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
  const answered = item.status === "answered";
  const correctChoice =
    item.status === "answered" ? item.question.choices.find((choice) => choice.correct) : undefined;
  const [translationState, setTranslationState] = useState({
    questionId: item.question.id,
    value: translation,
  });
  const [isTranslating, startTranslating] = useTransition();
  const automaticReviewRefresh = useRef<string | null>(null);
  const currentTranslation =
    translationState.questionId === item.question.id ? translationState.value : translation;
  const translatedReview =
    currentTranslation?.reviewStatus === "ready" ? currentTranslation.review : undefined;
  const reviewTranslationMissing =
    item.status === "answered" && currentTranslation?.reviewStatus === "missing";

  const loadTranslation = useCallback(async () => {
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
          scenario: null,
          artifacts: item.question.artifacts.map((artifact) => ({
            ...artifact,
            title: null,
          })),
          prompt: null,
          choices: item.question.choices.map((choice) => ({
            id: choice.id,
            label: null,
          })),
          unavailable: true,
          reviewStatus: item.status === "answered" ? "missing" : "hidden",
        },
      });
    }
  }, [item]);

  useEffect(() => {
    if (!reviewTranslationMissing) return;
    if (automaticReviewRefresh.current === item.question.id) return;

    automaticReviewRefresh.current = item.question.id;
    startTranslating(loadTranslation);
  }, [item.question.id, loadTranslation, reviewTranslationMissing]);

  function handleTranslate() {
    startTranslating(loadTranslation);
  }

  return (
    <article
      className={`quiz-card${answered ? " answered" : ""}`}
      aria-current={isActive ? "step" : undefined}
    >
      <div className="quiz-card-header">
        <div className="quiz-card-meta">
          <span>#{item.slot}</span>
          <strong>{reasonLabels[item.reason] ?? item.reason}</strong>
        </div>
      </div>
      <section className="quiz-scenario" aria-labelledby={`quiz-scenario-${item.question.id}`}>
        <p className="eyebrow" id={`quiz-scenario-${item.question.id}`}>
          Scenario
        </p>
        <p>{item.question.scenario}</p>
      </section>
      <QuestionArtifacts artifacts={item.question.artifacts} />
      <h2 ref={activeCardFocusRef} id={`quiz-question-${item.question.id}`} tabIndex={-1}>
        {item.question.prompt}
      </h2>
      <div className="quiz-card-translation">
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
      {isTranslating ? (
        <div className="translation-loading" aria-label="Translation loading" aria-live="polite">
          <span />
          <span />
          <span />
        </div>
      ) : null}
      {currentTranslation ? <QuizTranslationPanel translation={currentTranslation} /> : null}

      {answered ? (
        <div className="practical-answer-review" aria-label="Answer review">
          <section className="answer-review">
            <h3>Result</h3>
            <div className="answer-feedback">
              {item.answer?.correct ? (
                <CheckCircle2 size={20} aria-hidden="true" />
              ) : (
                <CircleHelp size={20} aria-hidden="true" />
              )}
              <div>
                <p>{item.answer?.correct ? "Correct" : "Review"}</p>
                <span>
                  {item.answer?.correct
                    ? "Your decision matches the case constraints."
                    : "Compare your decision with the stated constraints."}
                </span>
              </div>
            </div>
            <div className="answer-review-summary">
              <span>Your answer</span>
              <strong>
                {item.question.choices.find((choice) => choice.id === item.answer?.selectedChoiceId)
                  ?.label ?? "Unknown choice"}
              </strong>
            </div>
            <div className="answer-review-summary correct">
              <span>Correct answer</span>
              <strong>{correctChoice?.label ?? "Not configured"}</strong>
            </div>
            {reviewTranslationMissing ? (
              <p className="translation-review-status" aria-live="polite">
                {isTranslating
                  ? "Refreshing the Japanese answer review…"
                  : "Japanese answer review is unavailable. Use Translate to Japanese to retry."}
              </p>
            ) : null}
          </section>

          <section className="practical-review-section">
            <h3>Decision point</h3>
            <ul>
              {item.question.decisionCriteria.map((criterion) => (
                <li key={criterion}>{criterion}</li>
              ))}
            </ul>
            {translatedReview ? (
              <ul className="review-translation" lang="ja">
                {translatedReview.decisionCriteria.map((criterion) => (
                  <li key={criterion}>{criterion}</li>
                ))}
              </ul>
            ) : null}
          </section>

          <section className="practical-review-section">
            <h3>Why</h3>
            <p>{item.question.rationale}</p>
            {item.answer?.feedback ? (
              <p className="evaluation-feedback">{item.answer.feedback}</p>
            ) : null}
            {translatedReview?.rationale ? (
              <p className="review-translation" lang="ja">
                {translatedReview.rationale}
              </p>
            ) : null}
            {translatedReview?.feedback ? (
              <p className="evaluation-feedback review-translation" lang="ja">
                {translatedReview.feedback}
              </p>
            ) : null}
          </section>

          <section className="practical-review-section">
            <h3>Options</h3>
            <div className="answered-choice-list">
              {item.question.choices.map((choice, index) => {
                const selected = choice.id === item.answer?.selectedChoiceId;
                const correct = choice.correct;
                const translatedChoice = translatedReview?.choices.find(
                  (candidate) => candidate.id === choice.id,
                );

                return (
                  <div
                    key={choice.id}
                    className={`answered-choice${selected ? " selected" : ""}${correct ? " correct" : ""}`}
                  >
                    <span className="answered-choice-marker" aria-hidden="true">
                      {correct ? <CheckCircle2 size={16} /> : index + 1}
                    </span>
                    <p>{choice.label}</p>
                    <div className="answered-choice-badges">
                      {selected ? <span className="answer-badge selected">Your answer</span> : null}
                      {correct ? <span className="answer-badge correct">Correct</span> : null}
                    </div>
                    <div className="answered-choice-teaching">
                      <p>{choice.explanation}</p>
                      <span>{choice.consequence}</span>
                    </div>
                    {translatedChoice ? (
                      <div className="answered-choice-teaching review-translation" lang="ja">
                        {translatedChoice.explanation ? (
                          <p>{translatedChoice.explanation}</p>
                        ) : null}
                        {translatedChoice.consequence ? (
                          <span>{translatedChoice.consequence}</span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="practical-review-section">
            <h3>Practical notes</h3>
            <ul>
              {item.question.practicalNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            {translatedReview ? (
              <ul className="review-translation" lang="ja">
                {translatedReview.practicalNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            ) : null}
          </section>

          <section className="practical-review-section understanding-check">
            <h3>Check your understanding</h3>
            <p>{item.question.checkQuestion}</p>
            {translatedReview?.checkQuestion ? (
              <p className="review-translation" lang="ja">
                {translatedReview.checkQuestion}
              </p>
            ) : null}
          </section>
        </div>
      ) : (
        <form
          action={submitQuizAnswerAction}
          className="quiz-form"
          onSubmit={() => onAnswerSubmit?.(item.question.id)}
        >
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
            <span>
              Reasoning <small>(optional)</small>
            </span>
            <textarea
              name="reasoning"
              rows={3}
              placeholder="Why does this answer fit the source?"
            />
          </label>

          <button type="submit">Submit answer</button>
        </form>
      )}
    </article>
  );
}
