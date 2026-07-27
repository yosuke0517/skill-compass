import { describe, expect, it } from "vitest";

import { buildConceptsData } from "@/lib/concepts/get-concepts";

describe("buildConceptsData user isolation", () => {
  it("uses only the requested user's scores and review schedule", () => {
    const data = buildConceptsData({
      userId: "user_a",
      concepts: [
        {
          id: "concept_proxy",
          title: "reverse proxy",
          summary: "Routes traffic.",
          currentUnderstanding: "TLS and routing.",
        },
      ],
      tags: [{ id: "tag_net", name: "Networking" }],
      conceptTags: [{ conceptId: "concept_proxy", tagId: "tag_net" }],
      conceptSources: [{ conceptId: "concept_proxy", sourceId: "source_docs" }],
      questions: [{ id: "q_proxy", conceptId: "concept_proxy" }],
      scores: [
        { userId: "user_a", subjectType: "concept", subjectId: "concept_proxy", value: 0.42 },
        { userId: "user_b", subjectType: "concept", subjectId: "concept_proxy", value: 0.99 },
      ],
      answers: [
        { userId: "user_a", questionId: "q_proxy", nextReviewOn: "2026-07-11" },
        { userId: "user_b", questionId: "q_proxy", nextReviewOn: "2026-07-01" },
      ],
    });

    expect(data.concepts[0]).toMatchObject({
      score: 0.42,
      nextReviewOn: "2026-07-11",
    });
  });
});
