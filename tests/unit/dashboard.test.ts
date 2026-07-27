import { describe, expect, it } from "vitest";

import { buildDashboardData } from "@/lib/dashboard/get-dashboard";

describe("buildDashboardData", () => {
  it("matches MySQL date rows and answers to the configured local day at the UTC boundary", () => {
    const dashboard = buildDashboardData({
      userId: "user_a",
      today: "2026-07-28",
      categories: [],
      quizDays: [
        {
          id: "quiz_local_day",
          userId: "user_a",
          quizDate: new Date("2026-07-27T15:00:00.000Z"),
        },
      ],
      quizDayQuestions: [
        { quizDayId: "quiz_local_day", questionId: "q1", active: true },
      ],
      answers: [
        {
          userId: "user_a",
          quizDayId: "quiz_local_day",
          questionId: "q1",
          correct: true,
          answeredAt: new Date("2026-07-27T15:30:00.000Z"),
        },
      ],
      concepts: [],
      tags: [],
      scores: [],
      selfAssessments: [],
    });

    expect(dashboard.todayQuiz).toEqual({ answered: 1, total: 1 });
    expect(dashboard.streakDays).toBe(1);
    expect(dashboard.weeklyAccuracy).toBe(1);
  });

  it("builds dashboard summary from persisted learning signals", () => {
    const dashboard = buildDashboardData({
      userId: "user_a",
      today: "2026-07-08",
      categories: [
        { id: "cat_frontend", name: "Frontend", displayOrder: 1 },
        { id: "cat_backend", name: "Backend", displayOrder: 2 },
      ],
      quizDays: [
        { id: "quiz_2026-07-08", userId: "user_a", quizDate: "2026-07-08" },
        { id: "quiz_user_b_2026-07-08", userId: "user_b", quizDate: "2026-07-08" },
      ],
      quizDayQuestions: [
        { quizDayId: "quiz_2026-07-08", questionId: "q1", active: true },
        { quizDayId: "quiz_2026-07-08", questionId: "q2", active: true },
        { quizDayId: "quiz_user_b_2026-07-08", questionId: "q_other", active: true },
      ],
      answers: [
        { userId: "user_a", quizDayId: "quiz_2026-07-08", questionId: "q1", correct: true, answeredAt: "2026-07-08T09:00:00.000Z" },
        { userId: "user_a", quizDayId: "quiz_2026-07-07", questionId: "q3", correct: false, answeredAt: "2026-07-07T09:00:00.000Z" },
        { userId: "user_a", quizDayId: "quiz_2026-07-06", questionId: "q4", correct: true, answeredAt: "2026-07-06T09:00:00.000Z" },
        { userId: "user_b", quizDayId: "quiz_user_b_2026-07-08", questionId: "q_other", correct: false, answeredAt: "2026-07-08T10:00:00.000Z" },
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
        { userId: "user_a", subjectType: "category", subjectId: "cat_frontend", value: 0.72 },
        { userId: "user_a", subjectType: "category", subjectId: "cat_backend", value: 0.46 },
        { userId: "user_a", subjectType: "concept", subjectId: "concept_types", value: 0.34 },
        { userId: "user_a", subjectType: "concept", subjectId: "concept_contracts", value: 0.62 },
        { userId: "user_a", subjectType: "tag", subjectId: "tag_typescript", value: 0.18 },
        { userId: "user_a", subjectType: "tag", subjectId: "tag_api", value: 0.08 },
        { userId: "user_b", subjectType: "category", subjectId: "cat_frontend", value: 0.01 },
        { userId: "user_b", subjectType: "concept", subjectId: "concept_types", value: 0.99 },
        { userId: "user_b", subjectType: "tag", subjectId: "tag_typescript", value: 0.99 },
      ],
      selfAssessments: [
        { userId: "user_a", subjectType: "category", subjectId: "cat_frontend", rating: 0.82, assessedOn: "2026-07-08" },
        { userId: "user_a", subjectType: "category", subjectId: "cat_backend", rating: 0.7, assessedOn: "2026-07-08" },
        { userId: "user_b", subjectType: "category", subjectId: "cat_frontend", rating: 0.01, assessedOn: "2026-07-09" },
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

  it("counts only active assignments and finalized answers in Today progress and streaks", () => {
    const dashboard = buildDashboardData({
      userId: "user_a",
      today: "2026-07-08",
      categories: [],
      quizDays: [{ id: "quiz_today", userId: "user_a", quizDate: "2026-07-08" }],
      quizDayQuestions: [
        { quizDayId: "quiz_today", questionId: "q_active_done", active: true },
        { quizDayId: "quiz_today", questionId: "q_active_pending", active: true },
        { quizDayId: "quiz_today", questionId: "q_legacy_done", active: false },
      ],
      answers: [
        {
          userId: "user_a",
          quizDayId: "quiz_today",
          questionId: "q_active_done",
          correct: true,
          answeredAt: "2026-07-08T09:00:00.000Z",
        },
        {
          userId: "user_a",
          quizDayId: "quiz_today",
          questionId: "q_active_pending",
          correct: null,
          answeredAt: "2026-07-08T09:01:00.000Z",
        },
        {
          userId: "user_a",
          quizDayId: "quiz_today",
          questionId: "q_legacy_done",
          correct: true,
          answeredAt: "2026-07-08T09:02:00.000Z",
        },
      ],
      concepts: [],
      tags: [],
      scores: [],
      selfAssessments: [],
    });

    expect(dashboard.todayQuiz).toEqual({ answered: 1, total: 2 });
    expect(dashboard.streakDays).toBe(1);
    expect(dashboard.weeklyAccuracy).toBe(1);
  });

  it("does not turn an unfinalized retry row into a streak day", () => {
    const dashboard = buildDashboardData({
      userId: "user_a",
      today: "2026-07-08",
      categories: [],
      quizDays: [{ id: "quiz_today", userId: "user_a", quizDate: "2026-07-08" }],
      quizDayQuestions: [
        { quizDayId: "quiz_today", questionId: "q_pending", active: true },
      ],
      answers: [
        {
          userId: "user_a",
          quizDayId: "quiz_today",
          questionId: "q_pending",
          correct: null,
          answeredAt: "2026-07-08T09:00:00.000Z",
        },
      ],
      concepts: [],
      tags: [],
      scores: [],
      selfAssessments: [],
    });

    expect(dashboard.todayQuiz).toEqual({ answered: 0, total: 1 });
    expect(dashboard.streakDays).toBe(0);
    expect(dashboard.weeklyAccuracy).toBe(0);
  });
});
