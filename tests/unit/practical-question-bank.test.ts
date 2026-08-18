import { describe, expect, it } from "vitest";

import { createQuestionSeedPlan, toQuestionRow, toQuestionUpdate } from "@/db/seed-question-bank";
import { questionCaseTypeValues } from "@/db/schema";
import { reviewedQuestionBank } from "@/lib/quiz/content/question-bank";
import type { ReviewedQuestion } from "@/lib/quiz/content/types";
import { validateQuestionBank } from "@/lib/quiz/content/validate-question-bank";

const expectedIds = [
  ...Array.from({ length: 10 }, (_, index) => `q_cs_${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 10 }, (_, index) => `q_web_${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 10 }, (_, index) => `q_front_${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 10 }, (_, index) => `q_infra_${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 10 }, (_, index) => `q_sec_${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 10 }, (_, index) => `q_design_${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 10 }, (_, index) => `q_ai_${String(index + 1).padStart(2, "0")}`),
];
const addedAiIds = Array.from({ length: 5 }, (_, index) => `q_ai_${String(index + 11).padStart(2, "0")}`);

function groupCount(questions: ReviewedQuestion[], key: "categoryId" | "caseType" | "subtopicId") {
  return questions.reduce<Record<string, number>>((counts, question) => {
    counts[question[key]] = (counts[question[key]] ?? 0) + 1;
    return counts;
  }, {});
}

function question(id: string) {
  const match = reviewedQuestionBank.find((candidate) => candidate.id === id);
  expect(match, `missing reviewed question ${id}`).toBeDefined();
  return match!;
}

function searchableText(item: ReviewedQuestion) {
  return [
    item.scenario,
    item.prompt,
    item.rationale,
    item.checkQuestion,
    ...item.decisionCriteria,
    ...item.practicalNotes,
    ...item.artifacts.flatMap((artifact) => [artifact.title, artifact.content]),
    ...item.choices.flatMap((choice) => [choice.label, choice.explanation, choice.consequence]),
  ].join("\n");
}

function correctIdSequence(categoryId: string) {
  return reviewedQuestionBank
    .filter((item) => item.categoryId === categoryId)
    .map((item) => item.choices.find(({ correct }) => correct)!.id);
}

describe("reviewed practical question bank", () => {
  it("preserves the 70 stable IDs and extends the AI Engineering bank", () => {
    expect(reviewedQuestionBank).toHaveLength(75);
    expect(reviewedQuestionBank.map(({ id }) => id)).toEqual([...expectedIds, ...addedAiIds]);
    expect(groupCount(reviewedQuestionBank, "categoryId")).toEqual({
      cs_foundations: 10,
      web_backend: 10,
      frontend: 10,
      infrastructure: 10,
      security: 10,
      software_design: 10,
      ai_engineering: 15,
    });
  });

  it("passes the reviewed-bank validator", () => {
    expect(() => validateQuestionBank(reviewedQuestionBank)).not.toThrow();
  });

  it("uses every practical case type exactly twice per category", () => {
    for (const categoryId of [
      "cs_foundations",
      "web_backend",
      "frontend",
      "infrastructure",
      "security",
      "software_design",
      "ai_engineering",
    ]) {
      const categoryQuestions = reviewedQuestionBank.filter((item) => item.categoryId === categoryId);
      const expectedPerType = categoryId === "ai_engineering" ? 3 : 2;
      expect(groupCount(categoryQuestions, "caseType")).toEqual(
        Object.fromEntries(questionCaseTypeValues.map((caseType) => [caseType, expectedPerType])),
      );
    }
  });

  it("balances correct choice IDs without a dominant answer position", () => {
    const correctIdCounts = reviewedQuestionBank.reduce<Record<string, number>>((counts, item) => {
      const correctId = item.choices.find(({ correct }) => correct)!.id;
      counts[correctId] = (counts[correctId] ?? 0) + 1;
      return counts;
    }, {});

    expect(correctIdCounts).toEqual({ a: 20, b: 18, c: 18, d: 19 });
  });

  it("does not repeat a short correct-ID period within any category", () => {
    for (const categoryId of [
      "cs_foundations",
      "web_backend",
      "frontend",
      "infrastructure",
      "security",
      "software_design",
      "ai_engineering",
    ]) {
      const sequence = correctIdSequence(categoryId);
      const repeatingPeriods = [1, 2, 3, 4, 5].filter((period) =>
        sequence.every((id, index) => index < period || id === sequence[index - period]));

      expect(repeatingPeriods, `${categoryId}: ${sequence.join(",")}`).toEqual([]);
    }
  });

  it("makes the orders composite-index decision from the concrete query shape", () => {
    const text = searchableText(question("q_cs_09"));

    expect(text).toContain("orders");
    expect(text).toMatch(/WHERE\s+tenant_id\s*=\s*\?/i);
    expect(text).toMatch(/ORDER BY\s+created_at\s+DESC/i);
    expect(text).toMatch(/INDEX\s*\(\s*tenant_id\s*,\s*created_at/i);
  });

  it("shows valid TypeScript where satisfies preserves useful literal inference", () => {
    const item = question("q_front_01");
    const artifact = item.artifacts.find(({ language }) => language?.toLowerCase() === "typescript");

    expect(artifact?.content).toContain("satisfies");
    expect(artifact?.content).toMatch(/type\s+\w+\s*=/);
    expect(artifact?.content).toMatch(/const\s+\w+\s*=/);
  });

  it("distinguishes a compatible API response addition from breaking contract changes", () => {
    const item = question("q_web_04");
    const correct = item.choices.find(({ correct }) => correct);
    const distractors = item.choices.filter(({ correct }) => !correct);

    expect(correct?.label).toMatch(/optional|nullable|new field/i);
    expect(distractors.some(({ label }) => /remove|required|rename|type/i.test(label))).toBe(true);
    expect(searchableText(item)).toMatch(/existing client|backward.compatib/i);
  });

  it("requires no-cache plus a stable ETag and If-None-Match for mandatory revalidation", () => {
    const item = question("q_web_02");
    const correct = item.choices.find(({ correct }) => correct);
    const teachingText = [
      correct?.label,
      correct?.explanation,
      item.rationale,
      ...item.practicalNotes,
    ].join("\n");

    expect(teachingText).toMatch(/Cache-Control:\s*no-cache/i);
    expect(teachingText).toMatch(/stable ETag/i);
    expect(teachingText).toMatch(/If-None-Match/i);
  });

  it("covers Web and mobile clients plus theme and brand constraints for design tokens", () => {
    const text = searchableText(question("q_front_10"));

    expect(text).toMatch(/\bWeb\b/);
    expect(text).toMatch(/iOS|Android|mobile/);
    expect(text).toMatch(/dark mode|theme/i);
    expect(text).toMatch(/brand/i);
  });

  it("separates reverse-proxy TLS and upstream routing from a forward proxy", () => {
    const item = question("q_infra_09");
    const text = searchableText(item);

    expect(text).toMatch(/TLS/);
    expect(text).toMatch(/route|routing/);
    expect(text).toMatch(/upstream|load balanc/i);
    expect(item.choices.some(({ label }) => /forward proxy/i.test(label))).toBe(true);
  });

  it("includes authorization and software supply-chain decisions", () => {
    const authorization = searchableText(question("q_sec_01"));
    const supplyChain = searchableText(question("q_sec_07"));

    expect(authorization).toMatch(/authorize|authorization|ownership/i);
    expect(authorization).toMatch(/object|order|record|resource/i);
    expect(supplyChain).toMatch(/lockfile|provenance|pin/i);
    expect(supplyChain).toMatch(/dependency|package|artifact/i);
  });

  it("separates retrieval, evaluation, agent permissions, and MCP capability boundaries", () => {
    expect(searchableText(question("q_ai_03"))).toMatch(/retriev|top.k|document|chunk/i);
    expect(searchableText(question("q_ai_09"))).toMatch(/eval|regression|held.out|test set/i);
    expect(searchableText(question("q_ai_05"))).toMatch(/permission|approval|side effect|tool/i);
    expect(searchableText(question("q_ai_07"))).toMatch(/schema|capabilit|least privilege|allowlist/i);
  });

  it("publishes a satisfiable invoice schema with constrained required properties", () => {
    const artifact = question("q_ai_02").artifacts.find(({ kind }) => kind === "schema");
    const schema = JSON.parse(artifact!.content) as {
      type: string;
      required: string[];
      additionalProperties: boolean;
      properties: Record<string, Record<string, unknown>>;
    };

    expect(schema).toMatchObject({
      type: "object",
      required: ["currency", "amount", "dueDate"],
      additionalProperties: false,
      properties: {
        currency: { type: "string", enum: ["USD", "EUR", "JPY"] },
        amount: { type: "number", exclusiveMinimum: 0 },
        dueDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      },
    });
  });

  it("uses credible operational near-misses instead of joke or irrelevant distractors", () => {
    const allLabels = reviewedQuestionBank.flatMap((item) => item.choices.map(({ label }) => label)).join("\n");

    expect(allLabels).not.toMatch(/citation font size|developer laptops?|unused modules?|disable database audit logs/i);
    expect(searchableText(question("q_ai_03"))).toMatch(/generation prompt|context window|rerank/i);
    expect(searchableText(question("q_infra_01"))).toMatch(/Kubernetes|self.host|managed/i);
    expect(searchableText(question("q_design_06"))).toMatch(/shared utility|generic abstraction|extract/i);
    expect(searchableText(question("q_sec_10"))).toMatch(/network allowlist|query allowlist|shared read.only/i);
  });

  it("assigns representative scenarios to semantic case types", () => {
    expect(question("q_cs_09").caseType).toBe("debugging_performance");
    expect(question("q_web_04").caseType).toBe("common_failure");
    expect(question("q_front_04").caseType).toBe("maintainability_safety");
    expect(question("q_infra_09").caseType).toBe("basic_application");
    expect(question("q_sec_09").caseType).toBe("common_failure");
    expect(question("q_design_08").caseType).toBe("basic_application");
    expect(question("q_ai_01").caseType).toBe("design_tradeoff");
  });
});

describe("reviewed question seed conversion", () => {
  it("marks every reviewed ID active while excluding a legacy ID from the active set", () => {
    const plan = createQuestionSeedPlan(reviewedQuestionBank);

    expect([...plan.activeQuestionIds]).toEqual([...expectedIds, ...addedAiIds]);
    expect(plan.activeQuestionIds.has("question_extra_01")).toBe(false);
    expect(plan.rows.every(({ active }) => active)).toBe(true);
  });

  it("preserves every canonical field and every choice explanation in row conversion", () => {
    const source = question("q_ai_08");
    const row = toQuestionRow(source);

    expect(row).toEqual({
      id: source.id,
      conceptId: source.conceptId,
      sourceId: source.sourceId,
      scenario: source.scenario,
      artifacts: source.artifacts,
      caseType: source.caseType,
      decisionCriteria: source.decisionCriteria,
      practicalNotes: source.practicalNotes,
      checkQuestion: source.checkQuestion,
      prompt: source.prompt,
      choices: source.choices,
      difficulty: source.difficulty,
      rationale: source.rationale,
      active: true,
    });
    expect(row.choices.map(({ explanation }) => explanation)).toEqual(
      source.choices.map(({ explanation }) => explanation),
    );
  });

  it("produces equal insert and update values on repeated conversion", () => {
    const source = question("q_cs_09");

    expect(toQuestionRow(source)).toEqual(toQuestionRow(source));
    expect(toQuestionUpdate(source)).toEqual(toQuestionUpdate(source));
  });

  it("updates every mutable canonical field, including choices and active state", () => {
    const source = question("q_front_10");

    expect(toQuestionUpdate(source)).toEqual({
      conceptId: source.conceptId,
      sourceId: source.sourceId,
      scenario: source.scenario,
      artifacts: source.artifacts,
      caseType: source.caseType,
      decisionCriteria: source.decisionCriteria,
      practicalNotes: source.practicalNotes,
      checkQuestion: source.checkQuestion,
      prompt: source.prompt,
      choices: source.choices,
      difficulty: source.difficulty,
      rationale: source.rationale,
      active: true,
    });
  });
});
