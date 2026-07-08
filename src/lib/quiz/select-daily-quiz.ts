import type {
  QuizSelectionInput,
  QuizSelectionQuestion,
  QuizSelectionReason,
  SelectedQuizQuestion,
} from "./types";

const trustTierRank: Record<NonNullable<QuizSelectionQuestion["sourceTrustTier"]>, number> = {
  tier1: 0,
  tier2: 1,
  tier3: 2,
  tier4: 3,
};

export function selectDailyQuiz(input: QuizSelectionInput): SelectedQuizQuestion[] {
  const selected: SelectedQuizQuestion[] = [];
  const selectedIds = new Set<string>();
  const recentIds = new Set(input.recentlyAnsweredQuestionIds);
  const activeQuestions = input.questions.filter((question) => question.active !== false);

  const addQuestion = (question: QuizSelectionQuestion | undefined, reason: QuizSelectionReason) => {
    if (!question || selectedIds.has(question.id) || selected.length >= 5) return;

    selected.push({
      question,
      slot: selected.length + 1,
      reason,
    });
    selectedIds.add(question.id);
  };

  addQuestion(
    pickQuestion({
      questions: activeQuestions,
      selectedIds,
      recentIds,
      predicate: (question) => input.weakConceptIds.includes(question.conceptId),
      orderIds: input.weakConceptIds,
      orderBy: "concept",
    }),
    "weakness",
  );
  addQuestion(
    pickQuestion({
      questions: activeQuestions,
      selectedIds,
      recentIds,
      predicate: (question) => input.weakConceptIds.includes(question.conceptId),
      orderIds: input.weakConceptIds,
      orderBy: "concept",
    }),
    "weakness",
  );
  addQuestion(
    pickQuestion({
      questions: activeQuestions,
      selectedIds,
      recentIds,
      predicate: (question) => input.strongConceptIds.includes(question.conceptId),
      orderIds: input.strongConceptIds,
      orderBy: "concept",
    }),
    "strength_extension",
  );
  addQuestion(
    pickQuestion({
      questions: activeQuestions,
      selectedIds,
      recentIds,
      predicate: () => true,
      orderBy: "trustThenCreated",
    }),
    "latest_catchup",
  );
  addQuestion(
    pickQuestion({
      questions: activeQuestions,
      selectedIds,
      recentIds,
      predicate: (question) =>
        input.underrepresentedCategoryIds.includes(question.categoryId) ||
        input.gapCategoryIds.includes(question.categoryId),
      orderIds: [...input.underrepresentedCategoryIds, ...input.gapCategoryIds],
      orderBy: "category",
    }),
    "balancing",
  );

  for (const prepared of input.existingPreparedQuestions ?? []) {
    addQuestion(prepared.question, prepared.reason);
  }

  while (selected.length < 5) {
    const question = pickQuestion({
      questions: activeQuestions,
      selectedIds,
      recentIds,
      predicate: () => true,
      orderBy: "trustThenCreated",
    });
    if (!question) break;
    addQuestion(question, "fallback");
  }

  return selected.slice(0, 5).map((item, index) => ({ ...item, slot: index + 1 }));
}

type PickQuestionInput = {
  questions: QuizSelectionQuestion[];
  selectedIds: Set<string>;
  recentIds: Set<string>;
  predicate: (question: QuizSelectionQuestion) => boolean;
  orderIds?: string[];
  orderBy: "concept" | "category" | "trustThenCreated";
};

function pickQuestion(input: PickQuestionInput): QuizSelectionQuestion | undefined {
  const candidates = input.questions
    .filter((question) => !input.selectedIds.has(question.id))
    .filter(input.predicate)
    .sort((left, right) => compareQuestions(left, right, input));

  if (candidates.length === 0) return undefined;

  const nonRecent = candidates.filter((question) => !input.recentIds.has(question.id));
  if (nonRecent.length > 0) return nonRecent[0];

  const nonRecentFallback = input.questions
    .filter((question) => !input.selectedIds.has(question.id))
    .filter((question) => !input.recentIds.has(question.id))
    .sort((left, right) => compareQuestions(left, right, { ...input, orderBy: "trustThenCreated" }));

  return nonRecentFallback[0] ?? candidates[0];
}

function compareQuestions(left: QuizSelectionQuestion, right: QuizSelectionQuestion, input: PickQuestionInput): number {
  if (input.orderBy === "concept") {
    const byConcept = rank(left.conceptId, input.orderIds) - rank(right.conceptId, input.orderIds);
    if (byConcept !== 0) return byConcept;
  }

  if (input.orderBy === "category") {
    const byCategory = rank(left.categoryId, input.orderIds) - rank(right.categoryId, input.orderIds);
    if (byCategory !== 0) return byCategory;
  }

  const byTrust = getTrustRank(left) - getTrustRank(right);
  if (byTrust !== 0) return byTrust;

  const byCreated = getCreatedTime(right) - getCreatedTime(left);
  if (byCreated !== 0) return byCreated;

  return left.id.localeCompare(right.id);
}

function rank(value: string, values: string[] | undefined): number {
  const index = values?.indexOf(value) ?? -1;
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function getTrustRank(question: QuizSelectionQuestion): number {
  return question.sourceTrustTier ? trustTierRank[question.sourceTrustTier] : Number.MAX_SAFE_INTEGER;
}

function getCreatedTime(question: QuizSelectionQuestion): number {
  if (!question.createdAt) return 0;
  return new Date(question.createdAt).getTime();
}
