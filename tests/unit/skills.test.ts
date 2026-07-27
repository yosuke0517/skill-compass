import { describe, expect, it } from "vitest";

import { buildSkillsData } from "@/lib/skills/get-skills";

describe("buildSkillsData user isolation", () => {
  it("uses only the requested user's scores and self-assessments", () => {
    const data = buildSkillsData({
      userId: "user_a",
      categories: [{ id: "cat_frontend", name: "Frontend", description: "UI", displayOrder: 1 }],
      tags: [{ id: "tag_ts", categoryId: "cat_frontend", name: "TypeScript", description: "Types" }],
      scores: [
        { userId: "user_a", subjectType: "category", subjectId: "cat_frontend", value: 0.55 },
        { userId: "user_a", subjectType: "tag", subjectId: "tag_ts", value: 0.7 },
        { userId: "user_b", subjectType: "category", subjectId: "cat_frontend", value: 0.01 },
        { userId: "user_b", subjectType: "tag", subjectId: "tag_ts", value: 0.02 },
      ],
      selfAssessments: [
        {
          userId: "user_a",
          subjectType: "category",
          subjectId: "cat_frontend",
          rating: 0.8,
          assessedOn: "2026-07-09",
        },
        {
          userId: "user_b",
          subjectType: "category",
          subjectId: "cat_frontend",
          rating: 0.1,
          assessedOn: "2026-07-10",
        },
      ],
    });

    expect(data.categories[0]).toMatchObject({
      measured: 0.55,
      selfRating: 0.8,
      gap: { value: 0.25, label: "overconfidence" },
      tags: [{ tagId: "tag_ts", name: "TypeScript", description: "Types", score: 0.7 }],
    });
  });
});
