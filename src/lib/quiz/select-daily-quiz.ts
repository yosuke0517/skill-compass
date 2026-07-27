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

const MAX_SEARCH_CANDIDATES = 25;
const MAX_SEARCH_NODES = 75_000;

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

    selected.push({ question, slot: selected.length + 1, reason });
    selectedIds.add(question.id);
  };

  for (const prepared of input.existingPreparedQuestions ?? []) {
    addQuestion(prepared.question, prepared.reason);
  }

  const remaining = 5 - selected.length;
  const candidates = activeQuestions.filter((question) => !selectedIds.has(question.id));
  const freshCandidates = candidates.filter((question) => !recentIds.has(question.id));
  const dueCandidates = candidates.filter((question) => input.dueQuestionIds.includes(question.id));
  const preferredCandidates = uniqueQuestions([...dueCandidates, ...freshCandidates]);
  const eligible = preferredCandidates.length >= remaining
    ? preferredCandidates
    : uniqueQuestions([...preferredCandidates, ...candidates]);
  const chosen = chooseBalancedCandidates(
    eligible,
    selected.map((item) => item.question),
    remaining,
    input,
    seed,
    new Set(preferredCandidates.map((question) => question.id)),
  );

  for (const question of chosen) {
    addQuestion(question, selectionReason(question, input));
  }

  return selected.map((item, index) => ({ ...item, slot: index + 1 }));
}

function chooseBalancedCandidates(
  candidates: QuizSelectionQuestion[],
  preparedQuestions: QuizSelectionQuestion[],
  remaining: number,
  input: QuizSelectionInput,
  seed: string,
  preferredIds: ReadonlySet<string>,
): QuizSelectionQuestion[] {
  const count = Math.min(remaining, candidates.length);
  if (count <= 0) return [];

  const pool = buildSearchPool(candidates, input, seed, preferredIds);
  const enforceBalance = preparedQuestions.length + count === 5;
  const balancedSelection = findBestCombination(
    pool,
    preparedQuestions,
    count,
    input,
    seed,
    enforceBalance,
    preferredIds,
  );

  return balancedSelection
    ?? findBestCombination(pool, preparedQuestions, count, input, seed, false, preferredIds)
    ?? [];
}

function buildSearchPool(
  candidates: QuizSelectionQuestion[],
  input: QuizSelectionInput,
  seed: string,
  preferredIds: ReadonlySet<string>,
): QuizSelectionQuestion[] {
  const ranked = candidates.slice().sort((left, right) => compareBasePriority(left, right, input, seed));
  const pool: QuizSelectionQuestion[] = [];
  const add = (question: QuizSelectionQuestion | undefined) => {
    if (question && !pool.some((candidate) => candidate.id === question.id)) pool.push(question);
  };

  // Reserve representatives for the dimensions required by the five-question balance rule.
  for (const key of [
    (question: QuizSelectionQuestion) => question.caseType,
    (question: QuizSelectionQuestion) => question.correctChoiceId,
    (question: QuizSelectionQuestion) => question.categoryId,
  ]) {
    for (const value of new Set(ranked.map(key))) {
      if (pool.length >= MAX_SEARCH_CANDIDATES) return pool;
      add(ranked.find((question) => key(question) === value));
    }
  }
  for (const question of ranked) {
    if (pool.length >= MAX_SEARCH_CANDIDATES) break;
    if (preferredIds.has(question.id)) add(question);
  }
  for (const question of ranked) {
    if (pool.length >= MAX_SEARCH_CANDIDATES) break;
    add(question);
  }

  return pool;
}

function findBestCombination(
  candidates: QuizSelectionQuestion[],
  preparedQuestions: QuizSelectionQuestion[],
  count: number,
  input: QuizSelectionInput,
  seed: string,
  enforceBalance: boolean,
  preferredIds: ReadonlySet<string>,
): QuizSelectionQuestion[] | undefined {
  let best: QuizSelectionQuestion[] | undefined;
  let searchedNodes = 0;
  let exhausted = false;

  const search = (start: number, chosen: QuizSelectionQuestion[]) => {
    if (exhausted) return;
    searchedNodes += 1;
    if (searchedNodes > MAX_SEARCH_NODES) {
      exhausted = true;
      return;
    }
    if (chosen.length === count) {
      const allQuestions = [...preparedQuestions, ...chosen];
      if (enforceBalance && !hasRequiredBalance(allQuestions)) return;
      if (!best || compareCombinations(chosen, best, input, seed, preferredIds) < 0) {
        best = chosen.slice();
      }
      return;
    }

    const needed = count - chosen.length;
    for (let index = start; index <= candidates.length - needed; index += 1) {
      if (exhausted) return;
      const question = candidates[index];
      if (!question) continue;
      const allQuestions = [...preparedQuestions, ...chosen, question];
      if (maxCount(allQuestions.map((item) => item.categoryId)) > 2) continue;
      if (maxCount(allQuestions.map((item) => item.correctChoiceId)) > 2) continue;
      search(index + 1, [...chosen, question]);
    }
  };

  search(0, []);
  return best;
}

function hasRequiredBalance(questions: QuizSelectionQuestion[]): boolean {
  return maxCount(questions.map((question) => question.categoryId)) <= 2
    && new Set(questions.map((question) => question.caseType)).size >= 4
    && maxCount(questions.map((question) => question.correctChoiceId)) <= 2;
}

function compareCombinations(
  left: QuizSelectionQuestion[],
  right: QuizSelectionQuestion[],
  input: QuizSelectionInput,
  seed: string,
  preferredIds: ReadonlySet<string>,
): number {
  const byPreferred = countPreferred(right, preferredIds) - countPreferred(left, preferredIds);
  if (byPreferred !== 0) return byPreferred;

  const byNeed = combinationNeedScore(right, input) - combinationNeedScore(left, input);
  if (byNeed !== 0) return byNeed;

  const byTrust = combinationTrustScore(left) - combinationTrustScore(right);
  if (byTrust !== 0) return byTrust;

  const byDifficulty = combinationDifficultyScore(left) - combinationDifficultyScore(right);
  if (byDifficulty !== 0) return byDifficulty;

  const leftKey = left.map((question) => stableHash(`${seed}:${question.id}`)).sort((a, b) => a - b).join(":");
  const rightKey = right.map((question) => stableHash(`${seed}:${question.id}`)).sort((a, b) => a - b).join(":");
  return leftKey.localeCompare(rightKey);
}

function countPreferred(
  questions: QuizSelectionQuestion[],
  preferredIds: ReadonlySet<string>,
): number {
  return questions.filter((question) => preferredIds.has(question.id)).length;
}

function compareBasePriority(left: QuizSelectionQuestion, right: QuizSelectionQuestion, input: QuizSelectionInput, seed: string): number {
  const byNeed = needRank(left, input) - needRank(right, input);
  if (byNeed !== 0) return byNeed;

  const byTrust = getTrustRank(left) - getTrustRank(right);
  if (byTrust !== 0) return byTrust;

  const byDifficulty = difficultyFitRank[left.difficulty] - difficultyFitRank[right.difficulty];
  if (byDifficulty !== 0) return byDifficulty;

  const bySeed = stableHash(`${seed}:${left.id}`) - stableHash(`${seed}:${right.id}`);
  if (bySeed !== 0) return bySeed;

  return left.id.localeCompare(right.id);
}

function combinationNeedScore(questions: QuizSelectionQuestion[], input: QuizSelectionInput): number {
  return questions.reduce((score, question) => score + needScore(question, input), 0);
}

function combinationTrustScore(questions: QuizSelectionQuestion[]): number {
  return questions.reduce((score, question) => score + getTrustRank(question), 0);
}

function combinationDifficultyScore(questions: QuizSelectionQuestion[]): number {
  return questions.reduce((score, question) => score + difficultyFitRank[question.difficulty], 0);
}

function needRank(question: QuizSelectionQuestion, input: QuizSelectionInput): number {
  if (input.dueQuestionIds.includes(question.id)) return 0;
  if (input.weakConceptIds.includes(question.conceptId)) return 1;
  if (input.strongConceptIds.includes(question.conceptId)) return 2;
  if (input.underrepresentedCategoryIds.includes(question.categoryId) || input.gapCategoryIds.includes(question.categoryId)) return 3;
  return 4;
}

function needScore(question: QuizSelectionQuestion, input: QuizSelectionInput): number {
  if (input.dueQuestionIds.includes(question.id)) return 100;
  if (input.weakConceptIds.includes(question.conceptId)) return 10;
  if (input.strongConceptIds.includes(question.conceptId)) return 3;
  if (input.underrepresentedCategoryIds.includes(question.categoryId) || input.gapCategoryIds.includes(question.categoryId)) return 1;
  return 0;
}

function selectionReason(question: QuizSelectionQuestion, input: QuizSelectionInput): QuizSelectionReason {
  if (input.dueQuestionIds.includes(question.id) || input.weakConceptIds.includes(question.conceptId)) return "weakness";
  if (input.strongConceptIds.includes(question.conceptId)) return "strength_extension";
  if (input.underrepresentedCategoryIds.includes(question.categoryId) || input.gapCategoryIds.includes(question.categoryId)) {
    return "balancing";
  }
  return "latest_catchup";
}

function maxCount(values: string[]): number {
  return Math.max(0, ...Array.from(new Set(values), (value) => values.filter((candidate) => candidate === value).length));
}

function uniqueQuestions(questions: QuizSelectionQuestion[]): QuizSelectionQuestion[] {
  return Array.from(new Map(questions.map((question) => [question.id, question])).values());
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
