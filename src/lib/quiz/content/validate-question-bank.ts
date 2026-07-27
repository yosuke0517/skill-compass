import ts from "typescript";

import { difficultyValues, questionCaseTypeValues } from "@/db/schema";
import { learningCatalog } from "@/lib/quiz/content/catalog";
import type { LearningCategory, QuestionArtifact, ReviewedQuestion } from "@/lib/quiz/content/types";

const expectedChoiceIds = ["a", "b", "c", "d"];
const artifactKinds = new Set<QuestionArtifact["kind"]>([
  "code",
  "sql",
  "schema",
  "api",
  "config",
  "diagram",
]);
const genericRationalePatterns = [
  "this is correct",
  "this is the correct answer",
  "the correct answer is",
  "because it is correct",
  "this expresses the correct property",
];

export function validateQuestionBank(questions: ReviewedQuestion[]): void {
  assert(questions.length === 70, "question_bank_count");

  const categoryById = new Map<string, LearningCategory>(
    learningCatalog.map((category): [string, LearningCategory] => [category.id, category]),
  );
  const questionIds = new Set<string>();
  const promptScenarioPairs = new Set<string>();
  const correctChoiceCounts = new Map<string, number>();
  const categoryCaseTypes = new Map<string, Set<string>>();
  const categorySubtopics = new Map<string, Set<string>>();
  const categoryCounts = new Map<string, number>();

  for (const question of questions) {
    assertNonEmpty(question.id, "question_id");
    const normalizedId = normalize(question.id);
    assert(!questionIds.has(normalizedId), "question_id_duplicate");
    questionIds.add(normalizedId);

    const category = categoryById.get(question.categoryId);
    assert(category !== undefined, "question_category");
    assert(category.subtopics.some((subtopic) => subtopic.id === question.subtopicId), "question_subtopic");
    categoryCounts.set(question.categoryId, (categoryCounts.get(question.categoryId) ?? 0) + 1);
    addToSet(categorySubtopics, question.categoryId, question.subtopicId);

    assertNonEmpty(question.conceptId, "question_concept");
    assertNonEmpty(question.sourceId, "question_source");
    assertNonEmpty(question.scenario, "question_scenario");
    assertNonEmpty(question.prompt, "question_prompt");
    assertNonEmpty(question.rationale, "question_rationale");
    assertNonEmpty(question.checkQuestion, "question_check");
    assertStringList(question.decisionCriteria, "question_decision_criteria");
    assertStringList(question.practicalNotes, "question_practical_notes");
    assert(question.active === true, "question_active");

    const normalizedPair = `${normalize(question.prompt)}\u0000${normalize(question.scenario)}`;
    assert(!promptScenarioPairs.has(normalizedPair), "question_prompt_scenario_duplicate");
    promptScenarioPairs.add(normalizedPair);

    assertSupported(question.caseType, questionCaseTypeValues, "question_case_type");
    assertSupported(question.difficulty, difficultyValues, "question_difficulty");
    addToSet(categoryCaseTypes, question.categoryId, question.caseType);

    assertChoices(question);
    const correctChoice = question.choices.find((choice) => choice.correct);
    if (correctChoice) {
      correctChoiceCounts.set(correctChoice.id, (correctChoiceCounts.get(correctChoice.id) ?? 0) + 1);
    }

    assertArtifacts(question.artifacts);
    assert(!hasGenericRationale(question.rationale), "question_rationale_not_grounded");
  }

  for (const category of learningCatalog) {
    assert(categoryCounts.get(category.id) === 10, "question_category_count");
    const coveredSubtopics = categorySubtopics.get(category.id) ?? new Set<string>();
    assert(category.subtopics.every((subtopic) => coveredSubtopics.has(subtopic.id)), "question_subtopic_coverage");
    const coveredCaseTypes = categoryCaseTypes.get(category.id) ?? new Set<string>();
    assert(questionCaseTypeValues.every((caseType) => coveredCaseTypes.has(caseType)), "question_case_type_coverage");
  }

  for (const choiceId of expectedChoiceIds) {
    assert((correctChoiceCounts.get(choiceId) ?? 0) / questions.length <= 0.4, "question_choice_distribution");
  }
}

function assertChoices(question: ReviewedQuestion) {
  assert(question.choices.length === expectedChoiceIds.length, "question_choice_shape");
  assert(question.choices.map((choice) => choice.id).every((id, index) => id === expectedChoiceIds[index]), "question_choice_shape");
  assert(question.choices.filter((choice) => choice.correct).length === 1, "question_choice_correctness");

  for (const choice of question.choices) {
    assertNonEmpty(choice.label, "question_choice_label");
    assertNonEmpty(choice.explanation, "question_choice_explanation");
    assertNonEmpty(choice.consequence, "question_choice_consequence");
  }
}

function assertArtifacts(artifacts: QuestionArtifact[]) {
  assert(Array.isArray(artifacts), "question_artifact");

  for (const artifact of artifacts) {
    assert(artifactKinds.has(artifact.kind), "question_artifact_kind");
    assertNonEmpty(artifact.title, "question_artifact_title");
    assertNonEmpty(artifact.content, "question_artifact_content");
    if (artifact.language !== undefined) {
      assertNonEmpty(artifact.language, "question_artifact_language");
    }

    if (isTypeScript(artifact.language)) {
      assert(artifact.kind === "code", "question_typescript_artifact");
      assertTypeScriptSource(artifact.content);
    }
  }
}

function assertTypeScriptSource(sourceText: string) {
  const sourceFile = ts.createSourceFile("artifact.ts", sourceText, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);

  const parseDiagnostics = (sourceFile as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics;
  assert(parseDiagnostics.length === 0, "question_typescript_artifact");
  assert(containsTypeScriptSyntax(sourceFile), "question_typescript_artifact");
}

function containsTypeScriptSyntax(node: ts.Node): boolean {
  if (ts.isTypeNode(node)
    || ts.isInterfaceDeclaration(node)
    || ts.isTypeAliasDeclaration(node)
    || ts.isEnumDeclaration(node)
    || ts.isImportEqualsDeclaration(node)
    || ts.isAsExpression(node)
    || ts.isTypeAssertionExpression(node)
    || ts.isSatisfiesExpression(node)) {
    return true;
  }

  return ts.forEachChild(node, containsTypeScriptSyntax) === true;
}

function assertStringList(values: string[], code: string) {
  assert(Array.isArray(values) && values.length > 0 && values.every((value) => isNonEmpty(value)), code);
}

function addToSet(values: Map<string, Set<string>>, key: string, value: string) {
  const set = values.get(key) ?? new Set<string>();
  set.add(value);
  values.set(key, set);
}

function assertSupported(value: string, supportedValues: readonly string[], code: string) {
  assert(supportedValues.includes(value), code);
}

function hasGenericRationale(value: string) {
  const normalizedRationale = normalize(value).replace(/[.!?]+$/u, "");
  return genericRationalePatterns.some((pattern) => normalizedRationale === pattern || normalizedRationale.includes(pattern));
}

function normalize(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function assertNonEmpty(value: unknown, code: string): asserts value is string {
  assert(isNonEmpty(value), code);
}

function isTypeScript(language: string | undefined) {
  const normalizedLanguage = language?.trim().toLowerCase();
  return normalizedLanguage === "typescript" || normalizedLanguage === "ts";
}

function assert(condition: unknown, code: string): asserts condition {
  if (!condition) {
    throw new Error(code);
  }
}
