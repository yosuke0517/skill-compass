import { describe, expect, it } from "vitest";

import { learningCatalog } from "@/lib/quiz/content/catalog";
import type { ReviewedQuestion } from "@/lib/quiz/content/types";
import { validateQuestionBank } from "@/lib/quiz/content/validate-question-bank";

const caseTypes = [
  "basic_application",
  "common_failure",
  "design_tradeoff",
  "debugging_performance",
  "maintainability_safety",
] as const;
const choiceIds = ["a", "b", "c", "d"] as const;

function createValidBank(): ReviewedQuestion[] {
  let questionNumber = 0;

  return learningCatalog.flatMap((category) =>
    Array.from({ length: 10 }, (_, index) => {
      questionNumber += 1;
      const subtopic = category.subtopics[index % category.subtopics.length];
      const isTypeScript = category.id === "frontend" && index === 0;

      return {
        id: `q_${category.id}_${String(index + 1).padStart(2, "0")}`,
        categoryId: category.id,
        subtopicId: subtopic.id,
        conceptId: `concept_${category.id}_${subtopic.id}`,
        sourceId: `source_${category.id}`,
        scenario: `A production ${subtopic.id} case has constraint ${index + 1}.`,
        artifacts: isTypeScript
          ? [{
            kind: "code",
            title: "Typed implementation",
            language: "typescript",
            content: `const result: number = ${index};`,
          }]
          : [{
            kind: "config",
            title: "Case configuration",
            language: "text",
            content: `constraint=${index + 1}`,
          }],
        caseType: caseTypes[index % caseTypes.length],
        decisionCriteria: [`Preserve constraint ${index + 1}.`],
        practicalNotes: [`Apply this decision before release ${index + 1}.`],
        checkQuestion: `Which constraint matters for case ${index + 1}?`,
        prompt: `What is the best decision for ${category.id} case ${index + 1}?`,
        choices: choiceIds.map((id, choiceIndex) => ({
          id,
          label: `Choice ${id} for case ${questionNumber}`,
          correct: id === choiceIds[questionNumber % choiceIds.length],
          explanation: `Choice ${id} is evaluated against constraint ${index + 1}.`,
          consequence: `Choice ${id} changes outcome ${choiceIndex + 1}.`,
        })),
        difficulty: "intermediate",
        rationale: `The stated constraint ${index + 1} requires this decision in the production scenario.`,
        active: true,
      };
    }),
  );
}

function replaceQuestion(
  bank: ReviewedQuestion[],
  questionId: string,
  replacement: (question: ReviewedQuestion) => ReviewedQuestion,
) {
  return bank.map((question) => (question.id === questionId ? replacement(question) : question));
}

describe("reviewed question-bank validator", () => {
  it("publishes the exact seven-category taxonomy", () => {
    expect(Object.fromEntries(learningCatalog.map((category) => [category.id, category.subtopics.map((subtopic) => subtopic.id)]))).toEqual({
      cs_foundations: ["data_structures", "algorithms", "operating_systems", "networking", "databases"],
      web_backend: ["http", "apis", "authentication", "caching", "async_processing"],
      frontend: ["typescript", "browsers", "state_management", "accessibility"],
      infrastructure: ["cloud", "containers", "ci_cd", "observability"],
      security: ["authorization", "vulnerabilities", "secret_handling", "supply_chain"],
      software_design: ["distributed_systems", "maintainability", "tradeoffs"],
      ai_engineering: ["llms", "rag", "agents", "mcp", "evaluation", "safety"],
    });
  });

  it("accepts a complete, balanced reviewed bank", () => {
    expect(() => validateQuestionBank(createValidBank())).not.toThrow();
  });

  it("rejects a bank with the wrong total question count", () => {
    expect(() => validateQuestionBank(createValidBank().slice(1))).toThrow("question_bank_count");
  });

  it("rejects choices without exactly one correct answer", () => {
    const bank = replaceQuestion(createValidBank(), "q_cs_foundations_01", (question) => ({
      ...question,
      choices: question.choices.map((choice) => ({ ...choice, correct: choice.id === "a" || choice.id === "b" })),
    }));

    expect(() => validateQuestionBank(bank)).toThrow("question_choice_correctness");
  });

  it("rejects a category that misses a declared subtopic", () => {
    const bank = ["q_cs_foundations_05", "q_cs_foundations_10"].reduce(
      (questions, questionId) => replaceQuestion(questions, questionId, (question) => ({
        ...question,
        subtopicId: "data_structures",
      })),
      createValidBank(),
    );

    expect(() => validateQuestionBank(bank)).toThrow("question_subtopic_coverage");
  });

  it("rejects rationales that only make a generic correctness claim", () => {
    const bank = replaceQuestion(createValidBank(), "q_cs_foundations_01", (question) => ({
      ...question,
      rationale: "This expresses the correct property.",
    }));

    expect(() => validateQuestionBank(bank)).toThrow("question_rationale_not_grounded");
  });

  it("rejects JavaScript mislabeled as TypeScript", () => {
    const bank = replaceQuestion(createValidBank(), "q_frontend_01", (question) => ({
      ...question,
      artifacts: [{ ...question.artifacts[0], content: "const result = 1;" }],
    }));

    expect(() => validateQuestionBank(bank)).toThrow("question_typescript_artifact");
  });

  it("rejects TypeScript artifacts with syntax errors", () => {
    const bank = replaceQuestion(createValidBank(), "q_frontend_01", (question) => ({
      ...question,
      artifacts: [{ ...question.artifacts[0], content: "const result: = 1;" }],
    }));

    expect(() => validateQuestionBank(bank)).toThrow("question_typescript_artifact");
  });

  it("accepts security artifact examples as escaped source text", () => {
    const bank = replaceQuestion(createValidBank(), "q_security_01", (question) => ({
      ...question,
      artifacts: [{
        kind: "code",
        title: "Escaped XSS example",
        language: "html",
        content: '<script>alert("example")</script><button onclick="example()">Example</button>',
      }],
    }));

    expect(() => validateQuestionBank(bank)).not.toThrow();
  });

  it("rejects duplicate normalized prompt and scenario pairs", () => {
    const bank = replaceQuestion(createValidBank(), "q_cs_foundations_02", (question) => ({
      ...question,
      prompt: " What is the best decision for cs_foundations case 1? ",
      scenario: "A production data_structures case has constraint 1.",
    }));

    expect(() => validateQuestionBank(bank)).toThrow("question_prompt_scenario_duplicate");
  });

  it("rejects a category that does not cover every case type", () => {
    const bank = ["q_cs_foundations_05", "q_cs_foundations_10"].reduce(
      (questions, questionId) => replaceQuestion(questions, questionId, (question) => ({
        ...question,
        caseType: "basic_application",
      })),
      createValidBank(),
    );

    expect(() => validateQuestionBank(bank)).toThrow("question_case_type_coverage");
  });

  it("rejects a bank that concentrates one correct choice ID above forty percent", () => {
    const bank = createValidBank().map((question) => ({
      ...question,
      choices: question.choices.map((choice) => ({ ...choice, correct: choice.id === "a" })),
    }));

    expect(() => validateQuestionBank(bank)).toThrow("question_choice_distribution");
  });
});
