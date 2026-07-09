import { desc } from "drizzle-orm";
import { answers, concepts, questions, quizDays } from "@/db/schema";

export type HistoryBuildInput = {
  quizDays: Array<{ id: string; quizDate: string | Date }>;
  answers: Array<{
    quizDayId: string;
    questionId: string;
    selectedChoiceId: string;
    confidence: number;
    reasoning: string;
    correct: boolean | null;
    feedback: string | null;
    answeredAt: string | Date;
  }>;
  questions: Array<{
    id: string;
    conceptId: string;
    prompt: string;
    choices: Array<{ id: string; label: string; correct: boolean }>;
  }>;
  concepts: Array<{ id: string; title: string }>;
};

export type HistoryDaySummary = {
  date: string;
  label: string;
  answered: number;
  correct: number;
  accuracy: number;
};

export type HistoryMonthGroup = {
  month: string;
  label: string;
  answered: number;
  correct: number;
  accuracy: number;
  days: HistoryDaySummary[];
};

export type HistoryYearGroup = {
  year: string;
  answered: number;
  correct: number;
  accuracy: number;
  months: HistoryMonthGroup[];
};

export type HistoryArchiveData = {
  years: HistoryYearGroup[];
};

export type HistoryAnswerDetail = {
  questionId: string;
  conceptTitle: string;
  prompt: string;
  selectedChoiceLabel: string;
  correctChoiceLabel: string;
  confidence: number;
  reasoning: string;
  correct: boolean | null;
  feedback: string | null;
};

export type HistoryDayData = {
  date: string;
  answered: number;
  correct: number;
  accuracy: number;
  answers: HistoryAnswerDetail[];
};

export type HistoryPageData = {
  archive: HistoryArchiveData;
  selectedDay: HistoryDayData | null;
};

export async function getHistoryArchive(selectedDay?: string): Promise<HistoryPageData> {
  const { db } = await import("@/db/client");
  const [quizDayRows, answerRows, questionRows, conceptRows] = await Promise.all([
    db.select().from(quizDays).orderBy(desc(quizDays.quizDate)),
    db.select().from(answers).orderBy(desc(answers.answeredAt)),
    db.select().from(questions),
    db.select().from(concepts),
  ]);
  const input = {
    quizDays: quizDayRows,
    answers: answerRows,
    questions: questionRows,
    concepts: conceptRows,
  };
  const archive = buildHistoryArchive(input);
  const firstDay = archive.years[0]?.months[0]?.days[0]?.date;
  const selectedDate = selectedDay ?? firstDay;

  return {
    archive,
    selectedDay: selectedDate ? buildHistoryDay(input, selectedDate) : null,
  };
}

export function buildHistoryArchive(input: HistoryBuildInput): HistoryArchiveData {
  const quizDayById = new Map(input.quizDays.map((quizDay) => [quizDay.id, quizDay]));
  const daySummaries = new Map<string, { answered: number; correct: number }>();

  for (const answer of input.answers) {
    const quizDay = quizDayById.get(answer.quizDayId);
    const day = quizDay ? toDateKey(quizDay.quizDate) : toDateKey(answer.answeredAt);
    const current = daySummaries.get(day) ?? { answered: 0, correct: 0 };
    current.answered += 1;
    if (answer.correct === true) current.correct += 1;
    daySummaries.set(day, current);
  }

  const monthGroups = new Map<string, Map<string, HistoryDaySummary>>();
  for (const [date, summary] of daySummaries) {
    const [year, month, day] = date.split("-");
    const monthKey = `${year}-${month}`;
    const days = monthGroups.get(monthKey) ?? new Map<string, HistoryDaySummary>();
    days.set(date, {
      date,
      label: day,
      answered: summary.answered,
      correct: summary.correct,
      accuracy: calculateAccuracy(summary.correct, summary.answered),
    });
    monthGroups.set(monthKey, days);
  }

  const years = new Map<string, HistoryMonthGroup[]>();
  for (const [monthKey, dayMap] of monthGroups) {
    const [year, month] = monthKey.split("-");
    const days = [...dayMap.values()].sort((left, right) => right.date.localeCompare(left.date));
    const answered = sum(days, "answered");
    const correct = sum(days, "correct");
    const months = years.get(year) ?? [];
    months.push({
      month,
      label: monthLabel(month),
      answered,
      correct,
      accuracy: calculateAccuracy(correct, answered),
      days,
    });
    years.set(year, months);
  }

  return {
    years: [...years.entries()]
      .sort(([left], [right]) => right.localeCompare(left))
      .map(([year, months]) => {
        const sortedMonths = months.sort((left, right) => right.month.localeCompare(left.month));
        const answered = sum(sortedMonths, "answered");
        const correct = sum(sortedMonths, "correct");
        return {
          year,
          answered,
          correct,
          accuracy: calculateAccuracy(correct, answered),
          months: sortedMonths,
        };
      }),
  };
}

export function buildHistoryDay(input: HistoryBuildInput, day: string): HistoryDayData {
  const quizDayIds = new Set(
    input.quizDays.filter((quizDay) => toDateKey(quizDay.quizDate) === day).map((quizDay) => quizDay.id),
  );
  const questionById = new Map(input.questions.map((question) => [question.id, question]));
  const conceptById = new Map(input.concepts.map((concept) => [concept.id, concept]));
  const dayAnswers = input.answers
    .filter((answer) => quizDayIds.has(answer.quizDayId) || toDateKey(answer.answeredAt) === day)
    .sort((left, right) => toDateKey(left.answeredAt).localeCompare(toDateKey(right.answeredAt)));
  const details = dayAnswers.map((answer) => {
    const question = questionById.get(answer.questionId);
    const selectedChoice = question?.choices.find((choice) => choice.id === answer.selectedChoiceId);
    const correctChoice = question?.choices.find((choice) => choice.correct);
    const concept = question ? conceptById.get(question.conceptId) : undefined;

    return {
      questionId: answer.questionId,
      conceptTitle: concept?.title ?? "Unknown concept",
      prompt: question?.prompt ?? "Unknown question",
      selectedChoiceLabel: selectedChoice?.label ?? "Unknown answer",
      correctChoiceLabel: correctChoice?.label ?? "Unknown answer",
      confidence: answer.confidence,
      reasoning: answer.reasoning,
      correct: answer.correct,
      feedback: answer.feedback,
    };
  });
  const correct = details.filter((answer) => answer.correct === true).length;

  return {
    date: day,
    answered: details.length,
    correct,
    accuracy: calculateAccuracy(correct, details.length),
    answers: details,
  };
}

function toDateKey(value: string | Date): string {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function calculateAccuracy(correct: number, answered: number): number {
  if (answered === 0) return 0;
  return Number((correct / answered).toFixed(3));
}

function sum<T extends Record<K, number>, K extends keyof T>(items: T[], key: K): number {
  return items.reduce((total, item) => total + item[key], 0);
}

function monthLabel(month: string): string {
  const date = new Date(`2026-${month}-01T00:00:00.000Z`);
  return new Intl.DateTimeFormat("en", { month: "long", timeZone: "UTC" }).format(date);
}
