import type { TranslatedQuizCard } from "@/lib/translation/translate-quiz-card";

export function QuizTranslationPanel({ translation }: { translation: TranslatedQuizCard }) {
  if (translation.unavailable || translation.prompt === null) {
    return (
      <p className="translation-unavailable" role="alert">
        翻訳を利用できません。AI設定または通信状態を確認してください。
      </p>
    );
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
    </section>
  );
}
