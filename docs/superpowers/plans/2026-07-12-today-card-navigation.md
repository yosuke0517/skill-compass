# Today Card Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert Today from a long list of quiz cards into a mobile-first one-card-at-a-time experience with swipe and button navigation while preserving answer, translation, and assistant behavior.

**Architecture:** Keep `TodayPage` responsible for server-side quiz and translation data loading. Add a focused client-side navigator that owns only the current question index and gesture state, and render the existing `QuizQuestionCard` for the active item. Answer submission remains a Server Action; after revalidation, the navigator derives its position from the updated question list and preserves a valid current index.

**Tech Stack:** Next.js App Router, React 19 Client Components, TypeScript, CSS touch/pointer events, Playwright E2E, Vitest where pure navigation logic is extracted.

## Global Constraints

- The primary experience is mobile-first; desktop must remain usable but is not a separate design target.
- Unanswered questions remain navigable and must retain their unanswered state.
- Swipe is an enhancement; previous/next buttons and keyboard access remain available.
- Translation and the Today assistant remain attached to the active card only.
- Fixed bottom navigation must not overlap the card navigation controls.
- No new runtime dependency is required for swipe handling.
- Public repository changes must not include secrets, local paths, or private operational details.

---

### Task 1: Extract pure navigation rules

**Files:**
- Create: `src/components/quiz/quiz-card-navigator.ts`
- Test: `tests/unit/quiz-card-navigator.test.ts`

**Interfaces:**
- Produces `getNextQuestionIndex(currentIndex, total, direction)` and `getFirstUnansweredIndex(questions)` for the client component and tests.
- Consumes question records with `answer: { ... } | null`; it does not access the database or mutate answers.

- [ ] **Step 1: Write failing unit tests** for next/previous bounds, unanswered lookup, all-answered behavior, and empty input.
- [ ] **Step 2: Run** `pnpm exec vitest run tests/unit/quiz-card-navigator.test.ts`; verify the new module is missing or tests fail.
- [ ] **Step 3: Implement** the pure functions with clamped indexes and `-1` for no unanswered question.
- [ ] **Step 4: Run** the same Vitest command and verify all tests pass.

### Task 2: Build the one-card client navigator

**Files:**
- Create: `src/components/quiz/quiz-card-navigator.tsx`
- Modify: `src/app/(app)/today/page.tsx`
- Modify: `src/components/quiz/quiz-question-card.tsx` to expose a focusable heading target for active-card transitions.

**Interfaces:**
- `QuizCardNavigator` accepts `quizDayId`, `questions`, and `translations` using the existing `TodayQuizQuestion` and `TranslatedQuizCard` types.
- It renders exactly one `QuizQuestionCard` and exposes active index, answered count, previous/next controls, and unanswered indicators.

- [ ] **Step 1: Add a failing component test or E2E assertion** that `/today` renders one `.quiz-card`, shows `1 / N`, and exposes previous/next controls.
- [ ] **Step 2: Implement local index state** initialized to `0`, clamped when question data changes, with previous/next button handlers.
- [ ] **Step 3: Render navigation status** with accessible text such as `Question 1 of 5` and an indicator for unanswered cards.
- [ ] **Step 4: Replace the page-level `.quiz-stack` map** with `QuizCardNavigator`, leaving server-side data loading unchanged.
- [ ] **Step 5: Run** `pnpm typecheck` and the focused Playwright test; verify only one card is in the DOM.

### Task 3: Add swipe and keyboard interaction

**Files:**
- Modify: `src/components/quiz/quiz-card-navigator.tsx`
- Modify: `src/app/globals.css`
- Test: `tests/e2e/quiz-flow.spec.ts`

**Interfaces:**
- The navigator handles pointer/touch movement internally and calls the same `goTo(index)` function as the buttons.
- A swipe commits only when horizontal movement exceeds 56px and is greater than vertical movement.

- [ ] **Step 1: Add E2E assertions** for button navigation, ArrowLeft/ArrowRight navigation, and a horizontal pointer gesture at 390px width.
- [ ] **Step 2: Run** `pnpm exec playwright test tests/e2e/quiz-flow.spec.ts --project=chromium --workers=1`; verify the new interaction assertions fail before implementation.
- [ ] **Step 3: Implement pointer tracking** with start coordinates, movement-direction guard, and pointer-up threshold handling; use `touch-action: pan-y` so vertical page scrolling remains natural.
- [ ] **Step 4: Add keyboard handlers** to the navigator container and disabled states for the first/last buttons.
- [ ] **Step 5: Run** the focused E2E suite and verify all navigation modes pass.

### Task 4: Preserve answer and assistant workflows

**Files:**
- Modify: `src/components/quiz/quiz-card-navigator.tsx`
- Modify: `src/components/quiz/quiz-question-card.tsx` to expose the active-card focus target and answer completion callback.
- Modify: `src/app/(app)/today/page.tsx` for the `Add 5` placement.
- Modify: `src/app/globals.css`
- Test: `tests/e2e/quiz-flow.spec.ts`
- Test: `tests/e2e/quiz-translation.spec.ts`
- Test: `tests/e2e/today-assistant.spec.ts`

**Interfaces:**
- Existing Server Action form fields remain unchanged: `quizDayId`, `questionId`, `selectedChoiceId`, `confidence`, and optional `reasoning`.
- Active-card translation and assistant controls remain rendered by the existing card/widget components.

- [ ] **Step 1: Add tests** that an unanswered card can be skipped and revisited, an answered card shows its review, the translation button belongs to the active card, and the assistant remains available.
- [ ] **Step 2: Run the focused suites** and confirm the new assertions fail against the incomplete navigator behavior.
- [ ] **Step 3: Ensure answer submission** keeps the current card identity stable after the Server Action redirect/revalidation, then select the first unanswered question after the submitted card when one exists; never discard the submitted review state.
- [ ] **Step 4: Render `Add 5` as a compact sticky action above the navigator controls** so it remains reachable from every card without overlapping the fixed footer.
- [ ] **Step 5: Run** `pnpm exec playwright test tests/e2e/quiz-flow.spec.ts tests/e2e/quiz-translation.spec.ts tests/e2e/today-assistant.spec.ts --project=chromium --workers=1`.

### Task 5: Mobile visual and regression verification

**Files:**
- Modify: `src/app/globals.css`
- Modify: `tests/e2e/quiz-flow.spec.ts` to assert mobile card width, overflow, and footer-safe controls.

- [ ] **Step 1: Add mobile assertions** for card width, no horizontal overflow, navigation controls above the fixed footer, and one visible card at 390x844.
- [ ] **Step 2: Run** `pnpm typecheck`, `pnpm lint`, focused Vitest, and the full E2E suite with one worker.
- [ ] **Step 3: Run** `git diff --check` and inspect the mobile screenshot for footer overlap, clipped text, gesture affordance, and focus visibility.
- [ ] **Step 4: Run** `pnpm build` with the local non-secret database/session environment and restart the production tunnel process so iPhone verification uses the new build.

## Verification Commands

```bash
pnpm typecheck
pnpm lint
pnpm exec vitest run tests/unit/quiz-card-navigator.test.ts
pnpm exec playwright test tests/e2e/quiz-flow.spec.ts tests/e2e/quiz-translation.spec.ts tests/e2e/today-assistant.spec.ts --project=chromium --workers=1
pnpm exec playwright test --project=chromium --workers=1
git diff --check
```
