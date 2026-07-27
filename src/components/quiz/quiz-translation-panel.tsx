import type { TranslatedQuizCard } from "@/lib/translation/translate-quiz-card";

export function QuizTranslationPanel({ translation }: { translation: TranslatedQuizCard }) {
  if (translation.unavailable || translation.prompt === null) {
    return <p className="translation-unavailable">Japanese translation is unavailable right now.</p>;
  }

  return (
    <section className="translation-panel" aria-label="Japanese translation" lang="ja">
      {translation.scenario ? (
        <div>
          <strong>シナリオ</strong>
          <p>{translation.scenario}</p>
        </div>
      ) : null}
      {translation.artifacts.length > 0 ? (
        <div>
          <strong>補足資料</strong>
          <ul>
            {translation.artifacts.map((artifact, index) => (
              <li key={`${artifact.kind}-${index}`}>
                {artifact.title ?? "資料タイトルを翻訳できませんでした"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div>
        <strong>設問</strong>
        <p>{translation.prompt}</p>
      </div>
      <ol>
        {translation.choices.map((choice) => (
          <li key={choice.id}>{choice.label ?? "翻訳できませんでした"}</li>
        ))}
      </ol>
      {translation.decisionCriteria ? (
        <div>
          <strong>判断のポイント</strong>
          <ul>
            {translation.decisionCriteria.map((criterion) => (
              <li key={criterion}>{criterion}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {translation.rationale ? (
        <div>
          <strong>理由</strong>
          <p>{translation.rationale}</p>
        </div>
      ) : null}
      {translation.choices.some(
        (choice) => choice.explanation !== null || choice.consequence !== null,
      ) ? (
        <div>
          <strong>選択肢の解説</strong>
          <ol>
            {translation.choices.map((choice) => (
              <li key={choice.id}>
                {choice.explanation ? <p>{choice.explanation}</p> : null}
                {choice.consequence ? <p>{choice.consequence}</p> : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {translation.practicalNotes ? (
        <div>
          <strong>実務上の注意</strong>
          <ul>
            {translation.practicalNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {translation.checkQuestion ? (
        <div>
          <strong>理解確認</strong>
          <p>{translation.checkQuestion}</p>
        </div>
      ) : null}
      {translation.feedback ? (
        <div>
          <strong>フィードバック</strong>
          <p>{translation.feedback}</p>
        </div>
      ) : null}
    </section>
  );
}
