# Quiet Technical Studio UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the Skill Compass mobile-first UI into a distinctive Quiet Technical Studio system while preserving existing quiz, assistant, podcast, auth, and admin behavior.

**Architecture:** Establish shared visual tokens and shell behavior in the existing global stylesheet and navigation components, then apply them screen group by screen group. Keep server data loading and action boundaries unchanged; this work changes presentation, layout, states, and accessible labels only unless a screen needs a small view-model adjustment to express its state clearly.

**Tech Stack:** Next.js App Router, React 19, TypeScript, existing CSS, lucide-react, Playwright, Vitest.

## Global Constraints

- The primary experience is mobile-first; 390px is the reference viewport.
- The interface uses the Quiet Technical Studio direction: white surfaces, deep green primary actions, blue LLM/information accents, restrained radius, and no decorative orbs or oversized marketing hero.
- The UI must keep 5 bottom-navigation items on one line and must not create horizontal overflow.
- Fixed elements must respect `env(safe-area-inset-bottom)` and must not overlap form controls or quiz navigation.
- Existing routes, server actions, API contracts, provider boundaries, and public-safe repository rules remain unchanged.
- All major states retain visible loading, disabled, error, empty, success, and focus-visible treatment.
- No new runtime dependency is required.

## File Map

- Modify `src/app/globals.css`: shared tokens, type scale, surfaces, buttons, navigation, responsive layout, and screen-specific styling.
- Modify `src/app/(app)/layout.tsx`: compact authenticated shell without redundant session header.
- Modify `src/components/app-nav.tsx`: 5-item one-line bottom navigation with stable labels and active state.
- Modify `src/app/(app)/today/page.tsx`, `src/components/quiz/*`: Today hierarchy, progress rail, card states, and controls.
- Modify `src/app/(app)/dashboard/page.tsx`, `src/components/dashboard/*`: next-action-first dashboard hierarchy.
- Modify `src/app/(app)/podcast/page.tsx`, `src/app/(app)/podcast/settings/page.tsx`, `src/components/podcast/*`: playback, generation, and Episode Coach hierarchy.
- Modify `src/app/(app)/history/page.tsx`, `src/app/(app)/settings/page.tsx`, `src/app/(app)/sources/page.tsx`, `src/app/(auth)/login/page.tsx`: compact utility views and consistent forms.
- Modify `src/app/(admin)/admin/access/page.tsx`, `src/components/admin/*`: desktop-first admin density while retaining mobile usability.
- Modify `tests/e2e/mvp-navigation.spec.ts`, `tests/e2e/quiz-flow.spec.ts`, `tests/e2e/podcast-settings.spec.ts`, `tests/e2e/podcast-chat.spec.ts`: visual-contract and interaction assertions.
- Create `tests/e2e/quiet-technical-studio-ui.spec.ts`: shared shell, overflow, footer, and focus checks.

---

### Task 1: Shared Visual Foundation and App Shell

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/components/app-nav.tsx`
- Create: `tests/e2e/quiet-technical-studio-ui.spec.ts`

**Interfaces:**
- Preserve the existing `AppLayout({ children }: { children: ReactNode })` contract.
- Preserve `AppNav` route and `aria-current` behavior.
- Add stable selectors only where visual tests need them: `.app-frame`, `.app-nav`, `.app-nav a`, `.screen-title`, and `.app-surface` already exist and remain public CSS contracts.

- [ ] **Step 1: Add failing shell assertions**

```ts
import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

test("the app shell keeps the five navigation items on one line", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("local@example.com");
  await page.getByLabel("Password").fill("local-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByRole("link", { name: "Today" }).click();

  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav).toBeVisible();
  await expect(nav.locator("a")).toHaveCount(5);
  await expect(nav).toHaveCSS("white-space", "nowrap");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
```

- [ ] **Step 2: Run the new test and confirm it exposes the current shell gap**

Run: `./node_modules/.bin/playwright test tests/e2e/quiet-technical-studio-ui.spec.ts --project=chromium --workers=1`

Expected: the test either fails on the missing stable shell style or records the current overflow behavior.

- [ ] **Step 3: Replace the visual foundation**

Update `:root` tokens to the spec values, add `font-family` stacks for display/body/utility roles, reduce default radius and shadow strength, and make `.mobile-shell`, `.app-frame`, `.app-surface`, `.screen-title`, `.button`, `.ghost-button`, and `.app-nav` derive from those tokens. Keep the app frame centered on desktop and full-width on mobile.

- [ ] **Step 4: Make the app shell compact**

Keep `requireSession()` in the app layout, remove redundant session metadata from the visual shell, and keep logout available in Settings. Set the bottom navigation to `grid-template-columns: repeat(5, minmax(0, 1fr))`, keep labels one line with `white-space: nowrap`, and give each link a minimum 44px tap height.

- [ ] **Step 5: Run the shell test and commit**

Run: `./node_modules/.bin/playwright test tests/e2e/quiet-technical-studio-ui.spec.ts --project=chromium --workers=1`

Expected: 1 passing test with no horizontal overflow.

```bash
git add src/app/globals.css src/app/\(app\)/layout.tsx src/components/app-nav.tsx tests/e2e/quiet-technical-studio-ui.spec.ts
git commit -m "style: establish quiet technical studio shell"
```

### Task 2: Today Focused Practice Surface

**Files:**
- Modify: `src/app/(app)/today/page.tsx`
- Modify: `src/components/quiz/quiz-card-navigator.tsx`
- Modify: `src/components/quiz/quiz-question-card.tsx`
- Modify: `src/components/quiz/confidence-input.tsx`
- Modify: `src/app/globals.css`
- Modify: `tests/e2e/quiz-flow.spec.ts`
- Modify: `tests/e2e/quiz-translation.spec.ts`

**Interfaces:**
- Preserve `QuizCardNavigator` props and the server-action form fields.
- Preserve active-card translation and Today Assistant behavior.
- Preserve optional reasoning and the existing answer review semantics.

- [ ] **Step 1: Add visual-contract assertions**

Assert at 390x844 that `.today-quiz-summary` is compact, exactly one `.quiz-card` is in the navigator, the active card is within horizontal bounds, question indicators expose button names, and controls are above the fixed footer.

- [ ] **Step 2: Run the focused assertions before styling**

Run: `./node_modules/.bin/playwright test tests/e2e/quiz-flow.spec.ts tests/e2e/quiz-translation.spec.ts --project=chromium --workers=1`

Expected: existing interaction tests pass or expose only visual-contract failures.

- [ ] **Step 3: Implement the Today hierarchy**

Render a compact answered-count/date rail, small question-number buttons, and one dominant card. Keep the card content order as prompt, translation affordance, choices, confidence, optional reasoning, and submit. Use a single accent for the current number and separate warning styling for unanswered numbers.

- [ ] **Step 4: Implement answer-state styling**

Keep selected and correct answers distinct using labels, markers, and background treatment. Ensure the review summary remains readable when the user scrolls to the bottom and that Add 5 does not overlap the footer.

- [ ] **Step 5: Verify and commit**

Run: `./node_modules/.bin/playwright test tests/e2e/quiz-flow.spec.ts tests/e2e/quiz-translation.spec.ts --project=chromium --workers=1`

Expected: navigation, translation, answer review, and footer-safe layout pass.

```bash
git add src/app/\(app\)/today/page.tsx src/components/quiz src/app/globals.css tests/e2e/quiz-flow.spec.ts tests/e2e/quiz-translation.spec.ts
git commit -m "style: refine focused today practice"
```

### Task 3: Dashboard Next-Action Hierarchy

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx`
- Modify: `src/components/dashboard/dashboard-summary.tsx`
- Modify: `src/components/dashboard/radar-chart.tsx`
- Modify: `src/app/globals.css`
- Modify: `tests/e2e/dashboard.spec.ts`

**Interfaces:**
- Preserve dashboard data loading and `DashboardSummary` props.
- Preserve links to Today, Skills, Concepts, Sources, and History.

- [ ] **Step 1: Add assertions for the primary action**

Assert that Today/continue is the first actionable region, the summary values remain visible, and the dashboard has no horizontal overflow at mobile width.

- [ ] **Step 2: Build the dashboard structure**

Use a compact title row, a primary Today action, a restrained skill summary, and secondary reference links. Keep the radar chart as supporting evidence rather than the first visual element.

- [ ] **Step 3: Style data density**

Use utility text for dates and scores, quiet separators, and consistent surface padding. Avoid nesting cards inside cards.

- [ ] **Step 4: Verify and commit**

Run: `./node_modules/.bin/playwright test tests/e2e/dashboard.spec.ts --project=chromium --workers=1`

Expected: dashboard navigation and mobile bounds pass.

```bash
git add src/app/\(app\)/dashboard/page.tsx src/components/dashboard src/app/globals.css tests/e2e/dashboard.spec.ts
git commit -m "style: focus dashboard on next learning action"
```

### Task 4: Podcast Playback and Episode Coach Surface

**Files:**
- Modify: `src/app/(app)/podcast/page.tsx`
- Modify: `src/app/(app)/podcast/settings/page.tsx`
- Modify: `src/components/podcast/podcast-player.tsx`
- Modify: `src/components/podcast/podcast-episode-chat.tsx`
- Modify: `src/app/globals.css`
- Modify: `tests/e2e/podcast-settings.spec.ts`
- Modify: `tests/e2e/podcast-chat.spec.ts`

**Interfaces:**
- Preserve episode generation actions, audio endpoint behavior, entitlement checks, and chat API request shape.
- Preserve native audio playback so background playback remains possible.

- [ ] **Step 1: Add playback hierarchy assertions**

Assert that the active episode exposes title, state, audio controls, Download, and Ask this episode in that order, and that the coach sheet remains inside the mobile viewport.

- [ ] **Step 2: Reorganize the Podcast overview**

Make the current or newest episode the primary surface. Put Generate preview and Configure next, then show compact schedule/length/queue metadata and recent episodes.

- [ ] **Step 3: Rework Episode Coach**

Use a bottom sheet with clear header, conversation area, quick questions, textarea, voice toggle, and send action. Keep the audio player outside the sheet so opening the coach does not destroy playback.

- [ ] **Step 4: Rework Podcast Settings**

Group source cadence, generation schedule, language, Calendar, and X toggles into readable sections. Use desktop columns only above the existing responsive breakpoint; keep mobile controls full-width.

- [ ] **Step 5: Verify and commit**

Run: `./node_modules/.bin/playwright test tests/e2e/podcast-settings.spec.ts tests/e2e/podcast-chat.spec.ts --project=chromium --workers=1`

Expected: settings actions, player controls, coach interaction, and mobile bounds pass.

```bash
git add src/app/\(app\)/podcast src/components/podcast src/app/globals.css tests/e2e/podcast-settings.spec.ts tests/e2e/podcast-chat.spec.ts
git commit -m "style: clarify podcast playback and coach"
```

### Task 5: Archive, Settings, Sources, Login, and Admin Polish

**Files:**
- Modify: `src/app/(app)/history/page.tsx`
- Modify: `src/app/(app)/settings/page.tsx`
- Modify: `src/app/(app)/sources/page.tsx`
- Modify: `src/app/(auth)/login/page.tsx`
- Modify: `src/app/(admin)/admin/access/page.tsx`
- Modify: `src/components/admin/*`
- Modify: `src/app/globals.css`
- Modify: `tests/e2e/mvp-navigation.spec.ts`
- Modify: `tests/e2e/admin-access.spec.ts`

**Interfaces:**
- Preserve existing form actions, query parameters, route protection, admin authorization, and audit metadata boundaries.
- Do not expose credentials or private operational metadata in any screen.

- [ ] **Step 1: Add utility-screen assertions**

Assert that Login, Archive, Settings, Sources, and Admin all fit the mobile viewport, expose their primary action, and retain expected route links.

- [ ] **Step 2: Polish Archive and reference screens**

Use compact search and date hierarchy in Archive. Make Sources, Skills, and Concepts read as reference indexes rather than promotional cards.

- [ ] **Step 3: Polish Settings and Login**

Make Settings a clear grouped list with Session, Providers, Export, Sources, and access controls. Make Login quiet and focused with visible errors and no implementation details.

- [ ] **Step 4: Polish Admin desktop layout**

Use wider comparison columns, a dense audit table, and clear role/plan/entitlement controls above the desktop breakpoint while retaining readable stacked sections on mobile.

- [ ] **Step 5: Verify and commit**

Run: `./node_modules/.bin/playwright test tests/e2e/mvp-navigation.spec.ts tests/e2e/admin-access.spec.ts --project=chromium --workers=1`

Expected: all route and authorization checks pass.

```bash
git add src/app/\(app\)/history src/app/\(app\)/settings src/app/\(app\)/sources src/app/\(auth\)/login src/app/\(admin\) src/components/admin src/app/globals.css tests/e2e/mvp-navigation.spec.ts tests/e2e/admin-access.spec.ts
git commit -m "style: polish reference and admin screens"
```

### Task 6: Full Visual Verification and Handoff

**Files:**
- Modify: `tests/e2e/quiet-technical-studio-ui.spec.ts`
- Modify: `docs/superpowers/progress/skill-compass-mvp.md`

- [ ] **Step 1: Run static checks**

Run: `./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/eslint . && ./node_modules/.bin/vitest run`

Expected: all commands pass; Vitest excludes `.worktrees/**` through `vitest.config.ts`.

- [ ] **Step 2: Run the full browser suite**

Run: `./node_modules/.bin/playwright test --project=chromium --workers=1`

Expected: all E2E tests pass without horizontal overflow or footer overlap at the mobile viewport.

- [ ] **Step 3: Build and inspect production output**

Run: `DATABASE_URL='mysql://skill_compass:skill_compass@127.0.0.1:3306/skill_compass' SESSION_SECRET='local-test-session-secret-012345678901234567890123' ./node_modules/.bin/next build`

Inspect screenshots at 390x844 for Login, Dashboard, Today, Podcast, Archive, Settings, and Admin. Confirm that no secret, local path, Tunnel URL, or API key is included in tracked files.

- [ ] **Step 4: Update progress and commit**

Record completed UI tasks and the verification snapshot in `docs/superpowers/progress/skill-compass-mvp.md`, then run `git diff --check`.

```bash
git add tests/e2e/quiet-technical-studio-ui.spec.ts docs/superpowers/progress/skill-compass-mvp.md
git commit -m "docs: record quiet technical studio UI rollout"
```
