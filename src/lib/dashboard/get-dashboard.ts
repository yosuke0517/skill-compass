import {
  answers,
  categories,
  concepts,
  quizDayQuestions,
  quizDays,
  questions,
  scores,
  selfAssessments,
  tags,
} from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { localDateKey } from "@/lib/datetime/local-date";
import { calculateGap } from "@/lib/scoring/gaps";

export type DashboardData = {
  categoryScores: Array<{
    categoryId: string;
    name: string;
    measured: number;
    selfRating: number | null;
    gap: number | null;
  }>;
  todayQuiz: { answered: number; total: number };
  streakDays: number;
  weeklyAccuracy: number;
  weakPoints: Array<{ conceptId: string; title: string; score: number }>;
  improvingTags: Array<{ tagId: string; name: string; delta: number }>;
  prompts: Array<{ id: string; label: string; href: string }>;
};

export type DashboardBuildInput = {
  userId: string;
  today: string;
  categories: Array<{ id: string; name: string; displayOrder: number }>;
  quizDays: Array<{ id: string; userId: string; quizDate: string | Date }>;
  quizDayQuestions: Array<{ quizDayId: string; questionId: string; active: boolean }>;
  answers: Array<{
    userId: string;
    quizDayId: string;
    questionId: string;
    correct: boolean | null;
    answeredAt: string | Date;
  }>;
  concepts: Array<{ id: string; title: string }>;
  tags: Array<{ id: string; name: string }>;
  scores: Array<{
    userId: string;
    subjectType: "category" | "tag" | "concept";
    subjectId: string;
    value: number;
  }>;
  selfAssessments: Array<{
    userId: string;
    subjectType: "category" | "tag";
    subjectId: string;
    rating: number;
    assessedOn: string | Date;
  }>;
};

export async function getDashboardData(
  userId: string,
  today = localDateKey(),
): Promise<DashboardData> {
  const { db } = await import("@/db/client");
  const [
    categoryRows,
    quizDayRows,
    answerRows,
    conceptRows,
    tagRows,
    scoreRows,
    selfAssessmentRows,
  ] = await Promise.all([
    db.select().from(categories),
    db.select().from(quizDays).where(eq(quizDays.userId, userId)),
    db.select().from(answers).where(eq(answers.userId, userId)),
    db.select().from(concepts),
    db.select().from(tags),
    db.select().from(scores).where(eq(scores.userId, userId)),
    db.select().from(selfAssessments).where(eq(selfAssessments.userId, userId)),
  ]);
  const ownedQuizDayIds = quizDayRows.map((quizDay) => quizDay.id);
  const quizDayQuestionRows =
    ownedQuizDayIds.length > 0
      ? await db
          .select({
            quizDayId: quizDayQuestions.quizDayId,
            questionId: quizDayQuestions.questionId,
            active: questions.active,
          })
          .from(quizDayQuestions)
          .innerJoin(questions, eq(quizDayQuestions.questionId, questions.id))
          .where(inArray(quizDayQuestions.quizDayId, ownedQuizDayIds))
      : [];

  return buildDashboardData({
    userId,
    today,
    categories: categoryRows,
    quizDays: quizDayRows,
    quizDayQuestions: quizDayQuestionRows,
    answers: answerRows,
    concepts: conceptRows,
    tags: tagRows,
    scores: scoreRows,
    selfAssessments: selfAssessmentRows,
  });
}

export function buildDashboardData(input: DashboardBuildInput): DashboardData {
  const quizDaysForUser = input.quizDays.filter((quizDay) => quizDay.userId === input.userId);
  const answersForUser = input.answers.filter((answer) => answer.userId === input.userId);
  const finalizedAnswersForUser = answersForUser.filter((answer) => answer.correct !== null);
  const scoresForUser = input.scores.filter((score) => score.userId === input.userId);
  const selfAssessmentsForUser = input.selfAssessments.filter(
    (assessment) => assessment.userId === input.userId,
  );
  const scoreBySubject = new Map(
    scoresForUser.map((score) => [`${score.subjectType}:${score.subjectId}`, score.value]),
  );
  const latestSelfBySubject = new Map<string, DashboardBuildInput["selfAssessments"][number]>();

  for (const assessment of selfAssessmentsForUser) {
    const key = `${assessment.subjectType}:${assessment.subjectId}`;
    const current = latestSelfBySubject.get(key);
    if (!current || getTime(assessment.assessedOn) > getTime(current.assessedOn)) {
      latestSelfBySubject.set(key, assessment);
    }
  }

  const todayQuizDay = quizDaysForUser.find((quizDay) => toDateKey(quizDay.quizDate) === input.today);
  const todayQuizDayId = todayQuizDay?.id;
  const todayQuestionIds = new Set(
    input.quizDayQuestions
      .filter((item) => item.quizDayId === todayQuizDayId && item.active)
      .map((item) => item.questionId),
  );
  const todayAnsweredIds = new Set(
    finalizedAnswersForUser
      .filter((answer) => answer.quizDayId === todayQuizDayId)
      .map((answer) => answer.questionId),
  );

  const weeklyAnswers = finalizedAnswersForUser.filter((answer) => {
    const days = daysBetween(toDateKey(answer.answeredAt), input.today);
    return days >= 0 && days <= 6;
  });
  const correctWeeklyAnswers = weeklyAnswers.filter((answer) => answer.correct === true);

  return {
    categoryScores: input.categories
      .slice()
      .sort((left, right) => left.displayOrder - right.displayOrder)
      .map((category) => {
        const measured = round(scoreBySubject.get(`category:${category.id}`) ?? 0);
        const selfRating = latestSelfBySubject.get(`category:${category.id}`)?.rating ?? null;
        const gap = selfRating === null ? null : calculateGap(selfRating, measured).value;

        return {
          categoryId: category.id,
          name: category.name,
          measured,
          selfRating: selfRating === null ? null : round(selfRating),
          gap,
        };
      }),
    todayQuiz: {
      answered: [...todayAnsweredIds].filter((questionId) => todayQuestionIds.has(questionId)).length,
      total: todayQuestionIds.size,
    },
    streakDays: calculateStreakDays(finalizedAnswersForUser, input.today),
    weeklyAccuracy: weeklyAnswers.length === 0 ? 0 : round(correctWeeklyAnswers.length / weeklyAnswers.length),
    weakPoints: input.concepts
      .map((concept) => ({
        conceptId: concept.id,
        title: concept.title,
        score: round(scoreBySubject.get(`concept:${concept.id}`) ?? 0),
      }))
      .sort((left, right) => left.score - right.score || left.title.localeCompare(right.title))
      .slice(0, 3),
    improvingTags: input.tags
      .map((tag) => ({
        tagId: tag.id,
        name: tag.name,
        delta: round(scoreBySubject.get(`tag:${tag.id}`) ?? 0),
      }))
      .sort((left, right) => right.delta - left.delta || left.name.localeCompare(right.name))
      .slice(0, 3),
    prompts: [
      { id: "weekly-review", label: "Weekly review", href: "/settings#weekly-review" },
      { id: "monthly-map", label: "Monthly map", href: "/skills#monthly-map" },
    ],
  };
}

function calculateStreakDays(answerRows: DashboardBuildInput["answers"], today: string): number {
  const answeredDays = new Set(answerRows.map((answer) => toDateKey(answer.answeredAt)));
  let streak = 0;
  let cursor = new Date(`${today}T00:00:00.000Z`);

  while (answeredDays.has(toDateKey(cursor))) {
    streak += 1;
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
  }

  return streak;
}

function daysBetween(day: string, today: string): number {
  const dayTime = new Date(`${day}T00:00:00.000Z`).getTime();
  const todayTime = new Date(`${today}T00:00:00.000Z`).getTime();
  return Math.round((todayTime - dayTime) / (24 * 60 * 60 * 1000));
}

function toDateKey(value: string | Date): string {
  if (typeof value === "string") return value.slice(0, 10);
  return localDateKey(value);
}

function getTime(value: string | Date): number {
  return typeof value === "string" ? new Date(value).getTime() : value.getTime();
}

function round(value: number): number {
  return Number(value.toFixed(3));
}
