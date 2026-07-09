import { answers, conceptSources, concepts, conceptTags, questions, scores, tags } from "@/db/schema";

type ConceptRow = {
  id: string;
  title: string;
  summary: string | null;
  currentUnderstanding: string | null;
};

type TagRow = { id: string; name: string };
type ConceptTagRow = { conceptId: string; tagId: string };
type ConceptSourceRow = { conceptId: string; sourceId: string };
type ScoreRow = { subjectType: "category" | "tag" | "concept"; subjectId: string; value: number };
type QuestionRow = { id: string; conceptId: string };
type AnswerRow = { questionId: string; nextReviewOn: string | Date | null };

export type ConceptsData = {
  concepts: Array<{
    conceptId: string;
    title: string;
    summary: string | null;
    currentUnderstanding: string | null;
    tags: string[];
    score: number;
    sourceCount: number;
    nextReviewOn: string | null;
  }>;
};

export type BuildConceptsInput = {
  concepts: ConceptRow[];
  tags: TagRow[];
  conceptTags: ConceptTagRow[];
  conceptSources: ConceptSourceRow[];
  scores: ScoreRow[];
  questions: QuestionRow[];
  answers: AnswerRow[];
};

export async function getConceptsData(): Promise<ConceptsData> {
  const { db } = await import("@/db/client");
  const [conceptRows, tagRows, conceptTagRows, conceptSourceRows, scoreRows, questionRows, answerRows] =
    await Promise.all([
      db.select().from(concepts),
      db.select().from(tags),
      db.select().from(conceptTags),
      db.select().from(conceptSources),
      db.select().from(scores),
      db.select().from(questions),
      db.select().from(answers),
    ]);

  return buildConceptsData({
    concepts: conceptRows,
    tags: tagRows,
    conceptTags: conceptTagRows,
    conceptSources: conceptSourceRows,
    scores: scoreRows,
    questions: questionRows,
    answers: answerRows,
  });
}

export function buildConceptsData(input: BuildConceptsInput): ConceptsData {
  const tagById = new Map(input.tags.map((tag) => [tag.id, tag.name]));
  const scoreBySubject = new Map(input.scores.map((score) => [`${score.subjectType}:${score.subjectId}`, score.value]));
  const conceptIdByQuestionId = new Map(input.questions.map((question) => [question.id, question.conceptId]));

  return {
    concepts: input.concepts
      .map((concept) => {
        const reviewDates = input.answers
          .filter((answer) => conceptIdByQuestionId.get(answer.questionId) === concept.id && answer.nextReviewOn)
          .map((answer) => toDateKey(answer.nextReviewOn))
          .sort();

        return {
          conceptId: concept.id,
          title: concept.title,
          summary: concept.summary,
          currentUnderstanding: concept.currentUnderstanding,
          tags: input.conceptTags
            .filter((link) => link.conceptId === concept.id)
            .map((link) => tagById.get(link.tagId))
            .filter((name): name is string => Boolean(name)),
          score: round(scoreBySubject.get(`concept:${concept.id}`) ?? 0),
          sourceCount: input.conceptSources.filter((link) => link.conceptId === concept.id).length,
          nextReviewOn: reviewDates[0] ?? null,
        };
      })
      .sort((left, right) => left.score - right.score || left.title.localeCompare(right.title)),
  };
}

function toDateKey(value: string | Date | null): string {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function round(value: number): number {
  return Number(value.toFixed(3));
}
