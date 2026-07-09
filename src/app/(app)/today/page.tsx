import { QuizQuestionCard } from "@/components/quiz/quiz-question-card";
import { getTodayQuiz } from "@/lib/quiz/get-today-quiz";

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [{ error }, quiz] = await Promise.all([searchParams, getTodayQuiz()]);

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

      <div className="quiz-stack">
        {quiz.questions.map((item) => (
          <QuizQuestionCard key={item.question.id} quizDayId={quiz.quizDayId} item={item} />
        ))}
      </div>
    </>
  );
}
