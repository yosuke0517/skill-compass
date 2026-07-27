import { describe, expect, expectTypeOf, it } from "vitest";
import {
  auditLogs,
  categories,
  concepts,
  conceptTags,
  entitlements,
  mcpAccessTokens,
  mcpAuthorizationCodes,
  mcpOauthClients,
  planEntitlements,
  sourceTrustTierEnum,
  tags,
  translationCache,
  userEntitlementOverrides,
  users,
  answers,
  questions,
  quizDays,
  scores,
  selfAssessments,
  type QuestionArtifact,
  type QuestionChoice,
} from "@/db/schema";

describe("schema", () => {
  it("supports many-to-many concepts and tags", () => {
    expect(conceptTags).toBeDefined();
    expect(categories).toBeDefined();
    expect(tags).toBeDefined();
    expect(concepts).toBeDefined();
    expect(translationCache).toBeDefined();
  });

  it("defines source trust tiers", () => {
    expect(sourceTrustTierEnum.enumValues).toEqual(["tier1", "tier2", "tier3", "tier4"]);
  });

  it("defines extensible access control tables", () => {
    expect(users.role).toBeDefined();
    expect(users.plan).toBeDefined();
    expect(entitlements).toBeDefined();
    expect(planEntitlements).toBeDefined();
    expect(userEntitlementOverrides).toBeDefined();
    expect(auditLogs).toBeDefined();
  });

  it("defines persisted MCP OAuth tables", () => {
    expect(mcpOauthClients).toBeDefined();
    expect(mcpAuthorizationCodes).toBeDefined();
    expect(mcpAccessTokens).toBeDefined();
  });

  it("defines practical question fields and user-owned learning state", () => {
    expect(Object.keys(questions)).toEqual(
      expect.arrayContaining([
        "scenario",
        "artifacts",
        "caseType",
        "decisionCriteria",
        "practicalNotes",
        "checkQuestion",
      ]),
    );
    expect(Object.keys(quizDays)).toContain("userId");
    expect(Object.keys(answers)).toContain("userId");
    expect(Object.keys(scores)).toContain("userId");
    expect(Object.keys(selfAssessments)).toContain("userId");
  });

  it("types explained choices and constrained artifacts", () => {
    const choice: QuestionChoice = {
      id: "a",
      label: "Use an index.",
      correct: true,
      explanation: "It supports the query pattern.",
      consequence: "Reads become faster.",
    };
    const artifact: QuestionArtifact = {
      kind: "sql",
      title: "Query",
      content: "SELECT * FROM orders;",
    };

    expect(choice.consequence).toBe("Reads become faster.");
    expect(artifact.kind).toBe("sql");
    expectTypeOf<QuestionChoice["id"]>().toEqualTypeOf<"a" | "b" | "c" | "d">();
    expectTypeOf<QuestionArtifact["kind"]>().toEqualTypeOf<
      "code" | "sql" | "schema" | "api" | "config" | "diagram"
    >();
  });
});
