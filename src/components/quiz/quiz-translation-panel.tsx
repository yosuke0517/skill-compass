import type { TranslatedQuizCard } from "@/lib/translation/translate-quiz-card";

export function QuizTranslationPanel({ translation }: { translation: TranslatedQuizCard }) {
  if (translation.unavailable || translation.prompt === null) {
    return <p className="translation-unavailable">Japanese translation is unavailable right now.</p>;
  }

  return (
    <section className="translation-panel" aria-label="Japanese translation">
      <p>{translation.prompt}</p>
      <ol>
        {translation.choices.map((choice) => (
          <li key={choice.id}>{choice.label ?? "翻訳できませんでした"}</li>
        ))}
      </ol>
      {translation.feedback ? <strong>{translation.feedback}</strong> : null}
    </section>
  );
}
