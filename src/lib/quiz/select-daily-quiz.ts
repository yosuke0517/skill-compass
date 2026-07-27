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

const difficultyFitRank: Record<QuizSelectionQuestion["difficulty"], number> = {
  intermediate: 0,
  beginner: 1,
  advanced: 2,
};

export function selectDailyQuiz(input: QuizSelectionInput): SelectedQuizQuestion[] {
  const selected: SelectedQuizQuestion[] = [];
  const selectedIds = new Set<string>();
  const recentIds = new Set([
    ...input.recentlyAnsweredQuestionIds,
    ...input.recentlyAssignedQuestionIds,
  ]);
  const activeQuestions = input.questions.filter((question) => question.active !== false);
  const seed = `${input.userId}:${input.today}`;

  const addQuestion = (question: QuizSelectionQuestion | undefined, reason: QuizSelectionReason) => {
    if (!question || question.active === false || selectedIds.has(question.id) || selected.length >= 5) return;

    selected.push({
      question,
      slot: selected.length + 1,
      reason,
    });
    selectedIds.add(question.id);
  };

  for (const prepared of input.existingPreparedQuestions ?? []) {
    addQuestion(prepared.question, prepared.reason);
  }

  while (selected.length < 5) {
    const question = pickQuestion({ activeQuestions, input, recentIds, seed, selectedIds, selected });
    if (!question) break;
    addQuestion(question, selectionReason(question, input));
  }

  return selected.map((item, index) => ({ ...item, slot: index + 1 }));
}

type PickQuestionInput = {
  activeQuestions: QuizSelectionQuestion[];
  input: QuizSelectionInput;
  recentIds: Set<string>;
  seed: string;
  selectedIds: Set<string>;
  selected: SelectedQuizQuestion[];
};

function pickQuestion(input: PickQuestionInput): QuizSelectionQuestion | undefined {
  const candidates = input.activeQuestions.filter((question) => !input.selectedIds.has(question.id));
  if (candidates.length === 0) return undefined;

  // Do not reuse a recent item while any fresh active candidate remains.
  const freshCandidates = candidates.filter((question) => !input.recentIds.has(question.id));
  const eligible = freshCandidates.length > 0 ? freshCandidates : candidates;

  return eligible.sort((left, right) => compareQuestions(left, right, input))[0];
}

function compareQuestions(left: QuizSelectionQuestion, right: QuizSelectionQuestion, input: PickQuestionInput): number {
  const byNeed = needRank(left, input.input) - needRank(right, input.input);
  if (byNeed !== 0) return byNeed;

  const byCategory = selectedCount(left.categoryId, input.selected, (question) => question.categoryId) - selectedCount(right.categoryId, input.selected, (question) => question.categoryId);
  if (byCategory !== 0) return byCategory;

  const byCaseType = selectedCount(left.caseType, input.selected, (question) => question.caseType) - selectedCount(right.caseType, input.selected, (question) => question.caseType);
  if (byCaseType !== 0) return byCaseType;

  const byCorrectChoiceId = selectedCount(left.correctChoiceId, input.selected, (question) => question.correctChoiceId) - selectedCount(right.correctChoiceId, input.selected, (question) => question.correctChoiceId);
  if (byCorrectChoiceId !== 0) return byCorrectChoiceId;

  const byTrust = getTrustRank(left) - getTrustRank(right);
  if (byTrust !== 0) return byTrust;

  const byDifficulty = difficultyFitRank[left.difficulty] - difficultyFitRank[right.difficulty];
  if (byDifficulty !== 0) return byDifficulty;

  const bySeed = stableHash(`${input.seed}:${left.id}`) - stableHash(`${input.seed}:${right.id}`);
  if (bySeed !== 0) return bySeed;

  return left.id.localeCompare(right.id);
}

function needRank(question: QuizSelectionQuestion, input: QuizSelectionInput): number {
  if (input.weakConceptIds.includes(question.conceptId)) return 0;
  if (input.strongConceptIds.includes(question.conceptId)) return 1;
  if (input.underrepresentedCategoryIds.includes(question.categoryId) || input.gapCategoryIds.includes(question.categoryId)) return 2;
  return 3;
}

function selectionReason(question: QuizSelectionQuestion, input: QuizSelectionInput): QuizSelectionReason {
  if (input.weakConceptIds.includes(question.conceptId)) return "weakness";
  if (input.strongConceptIds.includes(question.conceptId)) return "strength_extension";
  if (input.underrepresentedCategoryIds.includes(question.categoryId) || input.gapCategoryIds.includes(question.categoryId)) {
    return "balancing";
  }
  return "latest_catchup";
}

function selectedCount<T>(value: T, selected: SelectedQuizQuestion[], getValue: (question: QuizSelectionQuestion) => T): number {
  return selected.filter((item) => getValue(item.question) === value).length;
}

function getTrustRank(question: QuizSelectionQuestion): number {
  return question.sourceTrustTier ? trustTierRank[question.sourceTrustTier] : Number.MAX_SAFE_INTEGER;
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
