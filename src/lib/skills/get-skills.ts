import { categories, scores, selfAssessments, tags } from "@/db/schema";
import { eq } from "drizzle-orm";
import { calculateGap } from "@/lib/scoring/gaps";
import type { SkillGap } from "@/lib/scoring/types";

type CategoryRow = {
  id: string;
  name: string;
  description: string | null;
  displayOrder: number;
};

type TagRow = {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
};

type ScoreRow = {
  userId: string;
  subjectType: "category" | "tag" | "concept";
  subjectId: string;
  value: number;
};

type SelfAssessmentRow = {
  userId: string;
  subjectType: "category" | "tag";
  subjectId: string;
  rating: number;
  assessedOn: string | Date;
};

export type SkillsData = {
  categories: Array<{
    categoryId: string;
    name: string;
    description: string | null;
    measured: number;
    selfRating: number | null;
    gap: SkillGap | null;
    tags: Array<{ tagId: string; name: string; description: string | null; score: number }>;
  }>;
};

export type BuildSkillsInput = {
  userId: string;
  categories: CategoryRow[];
  tags: TagRow[];
  scores: ScoreRow[];
  selfAssessments: SelfAssessmentRow[];
};

export async function getSkillsData(userId: string): Promise<SkillsData> {
  const { db } = await import("@/db/client");
  const [categoryRows, tagRows, scoreRows, selfAssessmentRows] = await Promise.all([
    db.select().from(categories),
    db.select().from(tags),
    db.select().from(scores).where(eq(scores.userId, userId)),
    db.select().from(selfAssessments).where(eq(selfAssessments.userId, userId)),
  ]);

  return buildSkillsData({
    userId,
    categories: categoryRows,
    tags: tagRows,
    scores: scoreRows,
    selfAssessments: selfAssessmentRows,
  });
}

export function buildSkillsData(input: BuildSkillsInput): SkillsData {
  const scoresForUser = input.scores.filter((score) => score.userId === input.userId);
  const selfAssessmentsForUser = input.selfAssessments.filter(
    (assessment) => assessment.userId === input.userId,
  );
  const scoreBySubject = new Map(
    scoresForUser.map((score) => [`${score.subjectType}:${score.subjectId}`, score.value]),
  );
  const latestSelfBySubject = new Map<string, SelfAssessmentRow>();

  for (const assessment of selfAssessmentsForUser) {
    const key = `${assessment.subjectType}:${assessment.subjectId}`;
    const current = latestSelfBySubject.get(key);
    if (!current || getTime(assessment.assessedOn) > getTime(current.assessedOn)) {
      latestSelfBySubject.set(key, assessment);
    }
  }

  return {
    categories: input.categories
      .slice()
      .sort((left, right) => left.displayOrder - right.displayOrder)
      .map((category) => {
        const measured = round(scoreBySubject.get(`category:${category.id}`) ?? 0);
        const selfRating = latestSelfBySubject.get(`category:${category.id}`)?.rating ?? null;

        return {
          categoryId: category.id,
          name: category.name,
          description: category.description,
          measured,
          selfRating: selfRating === null ? null : round(selfRating),
          gap: selfRating === null ? null : calculateGap(selfRating, measured),
          tags: input.tags
            .filter((tag) => tag.categoryId === category.id)
            .map((tag) => ({
              tagId: tag.id,
              name: tag.name,
              description: tag.description,
              score: round(scoreBySubject.get(`tag:${tag.id}`) ?? 0),
            })),
        };
      }),
  };
}

function round(value: number): number {
  return Number(value.toFixed(3));
}

function getTime(value: string | Date): number {
  return typeof value === "string" ? new Date(value).getTime() : value.getTime();
}
