import { describe, expect, it } from "vitest";

import {
  buildConceptSeedRows,
  learningSourceRows,
} from "@/db/learning-seed-data";
import { learningCatalog } from "@/lib/quiz/content/catalog";
import { reviewedQuestionBank } from "@/lib/quiz/content/question-bank";

describe("learning seed data", () => {
  it("publishes a learner-safe concept synopsis that is independent of each hidden rationale", () => {
    const conceptRows = buildConceptSeedRows(reviewedQuestionBank);
    const questionByConceptId = new Map(
      reviewedQuestionBank.map((question) => [question.conceptId, question]),
    );

    expect(conceptRows).toHaveLength(75);
    for (const concept of conceptRows) {
      const question = questionByConceptId.get(concept.id)!;
      expect(concept.currentUnderstanding).toEqual(expect.any(String));
      expect(concept.currentUnderstanding.length).toBeGreaterThan(20);
      expect(concept.currentUnderstanding).not.toBe(question.rationale);
      expect(concept.currentUnderstanding).not.toContain(question.rationale);
    }
  });

  it("maps every subtopic and all 70 questions to a claim-specific authoritative source", () => {
    const subtopicCount = learningCatalog.reduce(
      (total, category) => total + category.subtopics.length,
      0,
    );
    const sourceById = new Map<string, (typeof learningSourceRows)[number]>(
      learningSourceRows.map((source) => [source.id, source]),
    );

    expect(learningSourceRows).toHaveLength(subtopicCount);
    expect(sourceById.size).toBe(subtopicCount);
    const authoritativeHosts = new Set([
      "aws.amazon.com",
      "cheatsheetseries.owasp.org",
      "developer.mozilla.org",
      "developers.openai.com",
      "dev.mysql.com",
      "docs.aws.amazon.com",
      "docs.docker.com",
      "learn.microsoft.com",
      "modelcontextprotocol.io",
      "nodejs.org",
      "ocw.mit.edu",
      "opentelemetry.io",
      "owasp.org",
      "react.dev",
      "slsa.dev",
      "spec.openapis.org",
      "www.rabbitmq.com",
      "www.rfc-editor.org",
      "www.typescriptlang.org",
      "www.w3.org",
    ]);
    for (const question of reviewedQuestionBank) {
      const source = sourceById.get(question.sourceId);
      expect(source, `${question.id} source`).toBeDefined();
      const url = new URL(source!.url);
      expect(url.protocol).toBe("https:");
      expect(authoritativeHosts.has(url.hostname), source!.url).toBe(true);
      expect(url.pathname).not.toBe("/");
      expect(source!.official).toBe(true);
      expect(source!.trustTier).toBe("tier1");
    }
  });
});
