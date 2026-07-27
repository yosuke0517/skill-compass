import { describe, expect, it } from "vitest";

import { buildConceptsData } from "@/lib/concepts/get-concepts";
import { getLearningSource } from "@/lib/quiz/content/learning-sources";

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

  it("projects the canonical learner-safe synopsis instead of a stored exact rationale", () => {
    const source = getLearningSource("web_backend", "http");
    const hiddenRationale =
      "Cache-Control: no-cache plus the exact stable ETag answer is correct.";
    const data = buildConceptsData({
      userId: "user_a",
      concepts: [
        {
          id: "concept_web_etag_revalidation",
          title: "Which cache policy meets the freshness constraint?",
          summary: "A document must be checked before cached bytes are reused.",
          currentUnderstanding: hiddenRationale,
        },
      ],
      tags: [
        {
          id: "tag_web_backend_http",
          categoryId: "web_backend",
          name: "HTTP",
        },
      ],
      conceptTags: [
        {
          conceptId: "concept_web_etag_revalidation",
          tagId: "tag_web_backend_http",
        },
      ],
      conceptSources: [
        {
          conceptId: "concept_web_etag_revalidation",
          sourceId: source.id,
        },
      ],
      questions: [
        {
          id: "q_web_02",
          conceptId: "concept_web_etag_revalidation",
        },
      ],
      scores: [],
      answers: [],
    });

    expect(data.concepts[0]?.currentUnderstanding).toBe(source.conceptSynopsis);
    expect(data.concepts[0]?.currentUnderstanding).not.toContain(hiddenRationale);
  });
});
