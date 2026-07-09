import { TodayAssistantWidget } from "@/components/assistant/today-assistant-widget";
import { QuizQuestionCard } from "@/components/quiz/quiz-question-card";
import { getTodayQuiz } from "@/lib/quiz/get-today-quiz";
import { getTranslatedQuizCards } from "@/app/actions/translation";
import { addMoreQuizQuestionsAction } from "@/app/actions/quiz";
import { DAILY_QUIZ_LIMIT } from "@/lib/quiz/extend-daily-quiz";

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [{ error }, quiz] = await Promise.all([searchParams, getTodayQuiz()]);
  const translations = await getTranslatedQuizCards(quiz.questions);
  const completedCurrentSet = quiz.progress.total > 0 && quiz.progress.answered === quiz.progress.total;
  const canAddMore = completedCurrentSet && quiz.progress.total < DAILY_QUIZ_LIMIT;

  return (
    <>
      <div className="screen-title">
        <p className="eyebrow">Daily practice</p>
        <h1>Today</h1>
      </div>

      <section className="today-quiz-summary">
        <div>
          <p className="metric-label">Progress</p>
          <strong>
            {quiz.progress.answered} / {quiz.progress.total || 5}
          </strong>
        </div>
        <span>{quiz.quizDate}</span>
      </section>

      {error === "missing-answer" ? <p className="form-error">Choose an answer and add reasoning.</p> : null}

      {canAddMore ? (
        <form action={addMoreQuizQuestionsAction} className="add-questions-card">
          <input type="hidden" name="quizDayId" value={quiz.quizDayId} />
          <div>
            <p className="eyebrow">More practice</p>
            <strong>Add up to 5 questions</strong>
            <span>{DAILY_QUIZ_LIMIT - quiz.progress.total} remaining today</span>
          </div>
          <button type="submit">Add 5</button>
        </form>
      ) : completedCurrentSet ? (
        <section className="add-questions-card limit-reached">
          <div>
            <p className="eyebrow">Daily limit</p>
            <strong>30 / 30 complete</strong>
            <span>Nice work. Come back tomorrow for a fresh set.</span>
          </div>
        </section>
      ) : null}

      <div className="quiz-stack">
        {quiz.questions.map((item) => (
          <QuizQuestionCard key={item.question.id} quizDayId={quiz.quizDayId} item={item} translation={translations[item.question.id]} />
        ))}
      </div>
      <TodayAssistantWidget />
    </>
  );
}
