import Link from "next/link";
import { BookOpenCheck, CheckCircle2, Search } from "lucide-react";
import { getHistoryArchive } from "@/lib/history/get-history";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  const params = await searchParams;
  const data = await getHistoryArchive(params.day);

  return (
    <div className="screen-stack history-page">
      <section className="screen-title">
        <p className="eyebrow">Back number</p>
        <h1>Archive</h1>
        <p className="body-copy">Review answered Today quizzes by year, month, and day.</p>
      </section>

      <section className="history-search-placeholder" aria-label="Search preview">
        <Search size={18} aria-hidden="true" />
        <span>Free-word search is next</span>
      </section>

      {data.archive.years.length === 0 ? (
        <section className="empty-panel">
          <BookOpenCheck size={22} aria-hidden="true" />
          <h2>No answered days yet</h2>
          <p>Finish a Today quiz and it will appear here.</p>
        </section>
      ) : (
        <div className="history-layout">
          <section className="history-tree" aria-label="History by date">
            {data.archive.years.map((year) => (
              <div className="history-year" key={year.year}>
                <div className="history-year-heading">
                  <strong>{year.year}</strong>
                  <span>{Math.round(year.accuracy * 100)}%</span>
                </div>
                {year.months.map((month) => (
                  <div className="history-month" key={`${year.year}-${month.month}`}>
                    <div className="history-month-heading">
                      <span>{month.label}</span>
                      <small>{month.answered} answered</small>
                    </div>
                    <div className="history-days">
                      {month.days.map((day) => (
                        <Link
                          key={day.date}
                          href={`/history?day=${day.date}`}
                          aria-current={data.selectedDay?.date === day.date ? "page" : undefined}
                        >
                          <span>{day.label}</span>
                          <small>
                            {day.correct}/{day.answered}
                          </small>
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </section>

          {data.selectedDay ? (
            <section className="history-detail" aria-label="Selected day answers">
              <div className="history-detail-heading">
                <div>
                  <p className="eyebrow">Selected day</p>
                  <h2>{data.selectedDay.date}</h2>
                </div>
                <div className="history-score-pill">
                  <CheckCircle2 size={16} aria-hidden="true" />
                  <span>{Math.round(data.selectedDay.accuracy * 100)}%</span>
                </div>
              </div>

              <div className="history-answer-list">
                {data.selectedDay.answers.map((answer, index) => (
                  <article className="history-answer-card" key={`${answer.questionId}-${index}`}>
                    <div className="history-answer-meta">
                      <span>#{index + 1}</span>
                      <strong>{answer.conceptTitle}</strong>
                      <em>{answer.correct ? "Correct" : "Review"}</em>
                    </div>
                    <h3>{answer.prompt}</h3>
                    <dl>
                      <div>
                        <dt>Your answer</dt>
                        <dd>{answer.selectedChoiceLabel}</dd>
                      </div>
                      <div>
                        <dt>Expected</dt>
                        <dd>{answer.correctChoiceLabel}</dd>
                      </div>
                      <div>
                        <dt>Reasoning</dt>
                        <dd>{answer.reasoning}</dd>
                      </div>
                      {answer.feedback ? (
                        <div>
                          <dt>Feedback</dt>
                          <dd>{answer.feedback}</dd>
                        </div>
                      ) : null}
                    </dl>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
