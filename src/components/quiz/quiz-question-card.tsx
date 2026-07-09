import { Languages } from "lucide-react";

import { translateQuizCardAction } from "@/app/actions/translation";
import { CheckCircle2, CircleHelp } from "lucide-react";

import { submitQuizAnswerAction } from "@/app/actions/quiz";
import type { TodayQuizQuestion } from "@/lib/quiz/get-today-quiz";
import type { TranslatedQuizCard } from "@/lib/translation/translate-quiz-card";

import { ConfidenceInput } from "./confidence-input";
import { QuizTranslationPanel } from "./quiz-translation-panel";

type QuizQuestionCardProps = {
  quizDayId: string;
  item: TodayQuizQuestion;
  translation?: TranslatedQuizCard;
};

const reasonLabels: Record<string, string> = {
  weakness: "Weakness",
  strength_extension: "Stretch",
  latest_catchup: "Catch-up",
  balancing: "Balance",
  fallback: "Fallback",
};

export function QuizQuestionCard({ quizDayId, item, translation }: QuizQuestionCardProps) {
  const answered = item.answer !== null;

  return (
    <article className={`quiz-card${answered ? " answered" : ""}`}>
      <div className="quiz-card-header">
        <div className="quiz-card-meta">
          <span>#{item.slot}</span>
          <strong>{reasonLabels[item.reason] ?? item.reason}</strong>
        </div>
        <form action={translateQuizCardAction}>
          <input type="hidden" name="questionId" value={item.question.id} />
          <button type="submit" className="icon-button" title="Translate to Japanese" aria-label="Translate to Japanese">
            <Languages size={17} aria-hidden="true" />
          </button>
        </form>
      </div>
      <h2>{item.question.prompt}</h2>
      {translation ? <QuizTranslationPanel translation={translation} /> : null}

      {answered ? (
        <div className="answer-feedback">
          {item.answer?.correct ? <CheckCircle2 size={20} aria-hidden="true" /> : <CircleHelp size={20} aria-hidden="true" />}
          <div>
            <p>{item.answer?.correct ? "Correct" : "Review"}</p>
            <span>{item.answer?.feedback}</span>
          </div>
        </div>
      ) : (
        <form action={submitQuizAnswerAction} className="quiz-form">
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
            <span>Reasoning</span>
            <textarea name="reasoning" rows={3} required placeholder="Why does this answer fit the source?" />
          </label>

          <button type="submit">Submit answer</button>
        </form>
      )}
    </article>
  );
}
