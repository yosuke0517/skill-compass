import { describe, expect, it } from "vitest";

import { buildDashboardData } from "@/lib/dashboard/get-dashboard";

describe("buildDashboardData", () => {
  it("builds dashboard summary from persisted learning signals", () => {
    const dashboard = buildDashboardData({
      today: "2026-07-08",
      categories: [
        { id: "cat_frontend", name: "Frontend", displayOrder: 1 },
        { id: "cat_backend", name: "Backend", displayOrder: 2 },
      ],
      quizDays: [{ id: "quiz_2026-07-08", quizDate: "2026-07-08" }],
      quizDayQuestions: [
        { quizDayId: "quiz_2026-07-08", questionId: "q1" },
        { quizDayId: "quiz_2026-07-08", questionId: "q2" },
      ],
      answers: [
        { quizDayId: "quiz_2026-07-08", questionId: "q1", correct: true, answeredAt: "2026-07-08T09:00:00.000Z" },
        { quizDayId: "quiz_2026-07-07", questionId: "q3", correct: false, answeredAt: "2026-07-07T09:00:00.000Z" },
        { quizDayId: "quiz_2026-07-06", questionId: "q4", correct: true, answeredAt: "2026-07-06T09:00:00.000Z" },
      ],
      concepts: [
        { id: "concept_types", title: "Type modeling" },
        { id: "concept_contracts", title: "API contracts" },
      ],
      tags: [
        { id: "tag_typescript", name: "TypeScript" },
        { id: "tag_api", name: "API Design" },
      ],
      scores: [
        { subjectType: "category", subjectId: "cat_frontend", value: 0.72 },
        { subjectType: "category", subjectId: "cat_backend", value: 0.46 },
        { subjectType: "concept", subjectId: "concept_types", value: 0.34 },
        { subjectType: "concept", subjectId: "concept_contracts", value: 0.62 },
        { subjectType: "tag", subjectId: "tag_typescript", value: 0.18 },
        { subjectType: "tag", subjectId: "tag_api", value: 0.08 },
      ],
      selfAssessments: [
        { subjectType: "category", subjectId: "cat_frontend", rating: 0.82, assessedOn: "2026-07-08" },
        { subjectType: "category", subjectId: "cat_backend", rating: 0.7, assessedOn: "2026-07-08" },
      ],
    });

    expect(dashboard.todayQuiz).toEqual({ answered: 1, total: 2 });
    expect(dashboard.weeklyAccuracy).toBe(0.667);
    expect(dashboard.streakDays).toBe(3);
    expect(dashboard.categoryScores).toEqual([
      { categoryId: "cat_frontend", name: "Frontend", measured: 0.72, selfRating: 0.82, gap: 0.1 },
      { categoryId: "cat_backend", name: "Backend", measured: 0.46, selfRating: 0.7, gap: 0.24 },
    ]);
    expect(dashboard.weakPoints[0]).toEqual({ conceptId: "concept_types", title: "Type modeling", score: 0.34 });
    expect(dashboard.improvingTags[0]).toEqual({ tagId: "tag_typescript", name: "TypeScript", delta: 0.18 });
    expect(dashboard.prompts).toEqual([
      { id: "weekly-review", label: "Weekly review", href: "/settings#weekly-review" },
      { id: "monthly-map", label: "Monthly map", href: "/skills#monthly-map" },
    ]);
  });
});
