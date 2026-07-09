import { categories, scores, selfAssessments, tags } from "@/db/schema";
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
  subjectType: "category" | "tag" | "concept";
  subjectId: string;
  value: number;
};

type SelfAssessmentRow = {
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
  categories: CategoryRow[];
  tags: TagRow[];
  scores: ScoreRow[];
  selfAssessments: SelfAssessmentRow[];
};

export async function getSkillsData(): Promise<SkillsData> {
  const { db } = await import("@/db/client");
  const [categoryRows, tagRows, scoreRows, selfAssessmentRows] = await Promise.all([
    db.select().from(categories),
    db.select().from(tags),
    db.select().from(scores),
    db.select().from(selfAssessments),
  ]);

  return buildSkillsData({
    categories: categoryRows,
    tags: tagRows,
    scores: scoreRows,
    selfAssessments: selfAssessmentRows,
  });
}

export function buildSkillsData(input: BuildSkillsInput): SkillsData {
  const scoreBySubject = new Map(input.scores.map((score) => [`${score.subjectType}:${score.subjectId}`, score.value]));
  const latestSelfBySubject = new Map<string, SelfAssessmentRow>();

  for (const assessment of input.selfAssessments) {
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
