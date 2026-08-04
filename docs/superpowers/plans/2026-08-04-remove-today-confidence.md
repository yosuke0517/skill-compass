# Today Confidence Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Today回答から自信度を完全に削除し、選択肢と理由だけでWeb・MCP・Voice/Liveから回答・同期できるようにする。

**Architecture:** `confidence`をDB、domain、MCP、UI、read modelから削除し、スコアリングを正誤・reasoning quality・misconception severityだけで決定する。既存回答のその他の情報はmigrationで維持し、現行runbookと公開説明を新契約へ合わせる。

**Tech Stack:** Next.js 16 App Router、TypeScript 6、React 19、Drizzle ORM、MySQL 8.4、MCP TypeScript SDK、Zod 4、Vitest 4、Testing Library、Playwright。

## Global Constraints

- `confidence` columnと既存値は完全に削除し、別テーブルへ退避しない。
- 理由入力は必須のまま維持する。
- 新しい主観評価指標を追加しない。
- スコアは正誤、reasoning quality、misconception severityだけを使う。
- 古い入力に余分な`confidence`が含まれていても、それだけを理由に拒否しない。
- 過去回答のchoice、reasoning、correctness、feedback、履歴を維持する。
- 現在の仕様を説明する資料だけを更新し、過去のimplementation planは履歴として維持する。
- ユーザーownership、確定済み回答の保護、評価retryの挙動を変更しない。

---

## File map

- `src/lib/scoring/types.ts`: confidence非依存のscore input。
- `src/lib/scoring/rules.ts`: 新しい加点・復習間隔。
- `src/lib/scoring/gaps.ts`: confidence calibration専用のため削除。
- `src/lib/quiz/evaluate-answer.ts`: choiceとreasoningだけを評価へ渡す。
- `src/lib/quiz/submit-answer.ts`: confidenceなしのraw save/finalize。
- `src/db/schema.ts`、`drizzle/0017_remove_answer_confidence.sql`: DB column削除。
- `src/lib/quiz/today-service.ts`、`src/lib/quiz/get-today-quiz.ts`、`src/lib/quiz/web-today-quiz.ts`: answer DTOからconfidence削除。
- `src/lib/mcp/server.ts`: `submit_today_answer` schema更新。
- `src/app/actions/quiz.ts`: Web form入力更新。
- `src/components/quiz/quiz-question-card.tsx`: confidence UI削除。
- `src/components/quiz/confidence-input.tsx`: 削除。
- `src/app/globals.css`: confidence専用style削除。
- `src/lib/history/get-history.ts`、`src/app/(app)/history/page.tsx`: 履歴からconfidence削除。
- `src/lib/mcp/architecture/manifest.ts`、`docs/runbooks/chatgpt-mcp.md`、`docs/specs/skill-compass-lite-design.md`、`docs/showcase/skill-compass-architecture.html`: 現行説明更新。

---

### Task 1: Confidence-free scoring and evaluation

**Files:**
- Modify: `tests/unit/scoring.test.ts`
- Modify: `tests/unit/evaluate-answer.test.ts`
- Modify: `src/lib/scoring/types.ts`
- Modify: `src/lib/scoring/rules.ts`
- Delete: `src/lib/scoring/gaps.ts`
- Modify: `src/lib/quiz/evaluate-answer.ts`

**Interfaces:**
- Consumes: `reasoningQuality: "good" | "partial" | "poor"`、`misconceptionSeverity: "none" | "minor" | "major"`。
- Produces: `calculateScoreDelta(input: { correct; reasoningQuality; misconceptionSeverity }): ScoreDelta`と、confidenceを受け取らない`evaluateAnswer`。

- [ ] **Step 1: scoring testを新ルールへ書き換える**

`tests/unit/scoring.test.ts`から`calculateGap` importとgap testを削除し、次を検証する。

```ts
expect(calculateScoreDelta({
  correct: true,
  reasoningQuality: "good",
  misconceptionSeverity: "none",
})).toEqual({ delta: 0.11, reviewSoon: false, nextReviewDays: 14 });

expect(calculateScoreDelta({
  correct: true,
  reasoningQuality: "partial",
  misconceptionSeverity: "none",
})).toEqual({ delta: 0.06, reviewSoon: false, nextReviewDays: 7 });

expect(calculateScoreDelta({
  correct: false,
  reasoningQuality: "partial",
  misconceptionSeverity: "none",
})).toEqual({ delta: -0.01, reviewSoon: true, nextReviewDays: 2 });
```

minorとmajor misconceptionも`reviewSoon=true`かつ2日後になるtestを残す。

- [ ] **Step 2: failing testを実行する**

Run: `pnpm test -- tests/unit/scoring.test.ts tests/unit/evaluate-answer.test.ts`

Expected: `confidence`が必須で、新しい期待値と型が一致せずFAIL。

- [ ] **Step 3: scoring typeとruleからconfidenceを削除する**

`ScoreInput`を次へ変更する。

```ts
export type ScoreInput = {
  correct: boolean;
  reasoningQuality: ReasoningQuality;
  misconceptionSeverity: MisconceptionSeverity;
};
```

`calculateScoreDelta`は次の分岐だけを持つ。

```ts
let delta = input.correct ? 0.06 : -0.04;
if (input.correct && input.reasoningQuality === "good") delta += 0.05;
if (!input.correct && input.reasoningQuality === "partial") delta += 0.03;
if (input.misconceptionSeverity === "major") delta -= 0.08;
if (input.misconceptionSeverity === "minor") delta -= 0.02;

const reviewSoon = !input.correct || input.misconceptionSeverity !== "none";
const nextReviewDays = reviewSoon
  ? 2
  : input.reasoningQuality === "good"
    ? 14
    : 7;
```

`SkillGap` typeと`src/lib/scoring/gaps.ts`を削除する。`EvaluateAnswerInput`と`calculateScoreDelta`呼び出しからconfidenceを削除する。

- [ ] **Step 4: focused testsと型検査を実行する**

Run: `pnpm test -- tests/unit/scoring.test.ts tests/unit/evaluate-answer.test.ts && pnpm typecheck`

Expected: focused tests PASS。typecheckは後続のconfidence参照箇所を列挙してFAILしてよい。

- [ ] **Step 5: commitする**

```bash
git add tests/unit/scoring.test.ts tests/unit/evaluate-answer.test.ts src/lib/scoring/types.ts src/lib/scoring/rules.ts src/lib/scoring/gaps.ts src/lib/quiz/evaluate-answer.ts
git commit -m "refactor: remove confidence from Today scoring"
```

---

### Task 2: Persistence and submission domain

**Files:**
- Modify: `tests/integration/submit-answer.test.ts`
- Modify: `tests/unit/today-service.test.ts`
- Modify: `src/lib/quiz/submit-answer.ts`
- Modify: `src/lib/quiz/today-service.ts`
- Modify: `src/db/schema.ts`
- Create: `drizzle/0017_remove_answer_confidence.sql`
- Modify: `drizzle/meta/_journal.json`
- Create or modify: generated `drizzle/meta/*_snapshot.json`

**Interfaces:**
- Consumes: `SubmitAnswerInput` with user/day/quiz/question/choice/reasoning。
- Produces: confidenceを永続化・比較・返却しないanswer repositoryとToday service。

- [ ] **Step 1: confidenceなしのsubmission testsを書く**

fixtureと呼び出しからconfidenceを削除し、次の入力が成功することを検証する。

```ts
await submitAnswer({
  userId: "user_1",
  today: "2026-08-04",
  quizDayId: "quiz_1",
  questionId: "question_1",
  selectedChoiceId: "a",
  reasoning: "The stated constraint makes this the safest option.",
}, repository, provider);
```

saved raw answerと`expectedRaw`に`confidence`が存在しないこと、確定済み回答保護とownership testが維持されることをassertする。

- [ ] **Step 2: failing submission testsを実行する**

Run: `pnpm test -- tests/integration/submit-answer.test.ts tests/unit/today-service.test.ts`

Expected: input、saved answer、Today serviceがconfidenceを要求してFAIL。

- [ ] **Step 3: submission domainからconfidenceを削除する**

`SubmitAnswerInput`、`SavedRawAnswer`、`ExpectedRawAnswer`、`saveRawAnswer`、`finalizeAnswer`の比較条件、`evaluateAnswer`呼び出しからconfidenceを削除する。

finalize条件は次を維持する。

```ts
and(
  eq(answers.id, input.answerId),
  eq(answers.userId, input.userId),
  isNull(answers.correct),
  eq(answers.selectedChoiceId, input.expectedRaw.selectedChoiceId),
  eq(answers.reasoning, input.expectedRaw.reasoning),
)
```

`today-service.ts`のsubmit inputとinstructor pack existing answerからconfidenceを削除する。

- [ ] **Step 4: schema migrationを作成する**

`src/db/schema.ts`の`answers`から次を削除する。

```ts
confidence: int("confidence").notNull(),
```

Run: `pnpm db:generate`

生成結果がconfidence columnだけを削除することを確認する。migration SQLは実質次を含む。

```sql
ALTER TABLE `answers` DROP COLUMN `confidence`;
```

生成migrationの番号が`0017`でない場合は、実際の次番号を全参照で使用する。

- [ ] **Step 5: focused testsとmigration shapeを検証する**

Run: `pnpm test -- tests/integration/submit-answer.test.ts tests/unit/today-service.test.ts`

Run: `rg -n "confidence" src/lib/quiz/submit-answer.ts src/lib/quiz/today-service.ts src/db/schema.ts drizzle/0017_remove_answer_confidence.sql`

Expected: tests PASS、現行コードと新migrationにconfidenceフィールド参照なし。

- [ ] **Step 6: commitする**

```bash
git add tests/integration/submit-answer.test.ts tests/unit/today-service.test.ts src/lib/quiz/submit-answer.ts src/lib/quiz/today-service.ts src/db/schema.ts drizzle
git commit -m "refactor: remove confidence from Today persistence"
```

---

### Task 3: Learning MCP and SYNC PACK contract

**Files:**
- Modify: `tests/unit/mcp-tools.test.ts`
- Modify: `tests/integration/mcp-route.test.ts`
- Modify: `src/lib/mcp/server.ts`
- Modify: `docs/runbooks/chatgpt-mcp.md`

**Interfaces:**
- Consumes: choiceとreasoningが揃ったnormal-chat SYNC PACK。
- Produces: confidenceを要求しない`submit_today_answer` MCP tool。

- [ ] **Step 1: MCP schema testを新契約へ更新する**

tool propertiesを次でassertする。

```ts
expect(Object.keys(submitTool?.inputSchema.properties ?? {}).sort()).toEqual([
  "latestUserMessage",
  "questionId",
  "quizDayId",
  "reasoning",
  "selectedChoiceId",
]);
```

confidenceなしのtool callがserviceへ次を渡すtestを追加する。

```ts
expect(submitToday).toHaveBeenCalledWith({
  quizDayId: "quiz_1",
  questionId: "q1",
  selectedChoiceId: "a",
  reasoning: "The explicit constraint rules out the alternatives.",
});
```

余分な`confidence: 5`を含む古いcallも成功し、service inputへconfidenceを渡さないtestを追加する。

- [ ] **Step 2: failing MCP testsを実行する**

Run: `pnpm test -- tests/unit/mcp-tools.test.ts tests/integration/mcp-route.test.ts`

Expected: current schemaがconfidenceを要求してFAIL。

- [ ] **Step 3: MCP server contractを更新する**

`SkillCompassMcpServices.submitToday`とtool schemaからconfidenceを削除する。descriptionは次の意味に更新する。

```text
Submit an answer only after collecting the choice and reasoning. Never use during scheduled preparation; use later for a complete learner answer or SYNC PACK item.
```

Zod objectはstrict化せず、古い余分なconfidence fieldを既定どおりstripする。

- [ ] **Step 4: runbookのprepared packet、Voice/Live、SYNC PACK、normal-chat syncを更新する**

すべての「choice, confidence, reasoning」を「choice and reasoning」へ変更し、SYNC PACKを4フィールドにする。完成条件はchoiceとreasoningだけと明記する。

- [ ] **Step 5: focused testsを実行する**

Run: `pnpm test -- tests/unit/mcp-tools.test.ts tests/integration/mcp-route.test.ts`

Expected: PASS。

- [ ] **Step 6: commitする**

```bash
git add tests/unit/mcp-tools.test.ts tests/integration/mcp-route.test.ts src/lib/mcp/server.ts docs/runbooks/chatgpt-mcp.md
git commit -m "feat: sync Today answers without confidence"
```

---

### Task 4: Web Today and history UI

**Files:**
- Modify: `tests/unit/quiz-question-card.test.tsx`
- Modify: `tests/unit/history.test.ts`
- Modify: `tests/e2e/history.spec.ts`
- Modify: `src/app/actions/quiz.ts`
- Modify: `src/components/quiz/quiz-question-card.tsx`
- Delete: `src/components/quiz/confidence-input.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/lib/quiz/get-today-quiz.ts`
- Modify: `src/lib/quiz/web-today-quiz.ts`
- Modify: `src/lib/history/get-history.ts`
- Modify: `src/app/(app)/history/page.tsx`

**Interfaces:**
- Consumes: selected choiceと非空reasoningのform submission。
- Produces: confidence入力・表示のないToday cardとhistory detail。

- [ ] **Step 1: UI/read-model testsをconfidenceなしへ更新する**

unanswered card testを次へ変更する。

```ts
expect(container.querySelector('input[name="confidence"]')).toBeNull();
expect(container.querySelector('textarea[name="reasoning"]')).toBeTruthy();
```

history fixtureとexpected detailからconfidenceを削除する。reasoning、feedback、正答率が残ることをassertする。

- [ ] **Step 2: failing UI testsを実行する**

Run: `pnpm test -- tests/unit/quiz-question-card.test.tsx tests/unit/history.test.ts`

Expected: confidence inputとhistory fieldが残っているためFAIL。

- [ ] **Step 3: Web formからconfidenceを削除する**

`submitQuizAnswerAction`はchoiceとtrim済みreasoningを読み、どちらかが欠ける場合に`missing-answer`へredirectする。

```ts
if (!quizDayId || !questionId || !selectedChoiceId || !reasoning) {
  redirect("/today?error=missing-answer");
}
```

`QuizQuestionCard`から`ConfidenceInput` import/renderを削除し、component fileを削除する。`globals.css`の`.confidence-input`専用rulesを削除する。

- [ ] **Step 4: Todayとhistory read modelからconfidenceを削除する**

`get-today-quiz.ts`、`web-today-quiz.ts`、`get-history.ts`のanswer typesとmapからconfidenceを削除する。History pageに表示箇所があれば削除する。

- [ ] **Step 5: focused testsを実行する**

Run: `pnpm test -- tests/unit/quiz-question-card.test.tsx tests/unit/history.test.ts`

Run: `pnpm test:e2e -- tests/e2e/history.spec.ts`

Expected: unit PASS。E2Eは必要なlocal server/test DB設定がある環境でPASSし、環境不足ならその理由を記録する。

- [ ] **Step 6: commitする**

```bash
git add tests/unit/quiz-question-card.test.tsx tests/unit/history.test.ts tests/e2e/history.spec.ts src/app/actions/quiz.ts src/components/quiz/quiz-question-card.tsx src/components/quiz/confidence-input.tsx src/app/globals.css src/lib/quiz/get-today-quiz.ts src/lib/quiz/web-today-quiz.ts src/lib/history/get-history.ts 'src/app/(app)/history/page.tsx'
git commit -m "refactor: remove confidence from Today UI"
```

---

### Task 5: Architecture manifest and current product documentation

**Files:**
- Modify: `tests/unit/mcp-architecture-manifest.test.ts`
- Modify: `src/lib/mcp/architecture/manifest.ts`
- Modify: `docs/specs/skill-compass-lite-design.md`
- Modify: `docs/showcase/skill-compass-architecture.html`
- Modify: `docs/superpowers/specs/2026-07-27-practical-today-learning-design.md`
- Modify: `docs/superpowers/progress/skill-compass-mvp.md`

**Interfaces:**
- Consumes: confidence-free current implementation facts。
- Produces: Architecture MCPと公開資料が返すreviewed current facts。

- [ ] **Step 1: manifest safety/current-fact testを更新する**

manifest serializationに現在機能としてのconfidenceが含まれないことを追加する。

```ts
expect(JSON.stringify(architectureManifest).toLowerCase()).not.toContain("confidence");
```

- [ ] **Step 2: failing manifest testを実行する**

Run: `pnpm test -- tests/unit/mcp-architecture-manifest.test.ts tests/unit/mcp-architecture-answers.test.ts`

Expected: manifestのanswer state説明にconfidenceが残っているためFAIL。

- [ ] **Step 3: reviewed manifestを更新する**

learning stateの列挙を次の意味へ変更する。

```text
daily assignments, selected answers, reasoning, evaluation results, scores, self-assessments, and history
```

秘匿情報、PII、MCP boundaryの既存説明は変更しない。

- [ ] **Step 4: 現行資料を更新する**

Lite設計のinput、scoring、storageからconfidenceを削除し、正誤・reasoning quality・misconception severityによるルールを記載する。showcaseの「選択・自信度・理由」を「選択・理由」へ変更する。practical Today設計と進捗記録には、2026-08-04の後続設計でconfidenceを廃止したことを追記し、元の時点の履歴を誤って書き換えない。

- [ ] **Step 5: docsとmanifest testsを検証する**

Run: `pnpm test -- tests/unit/mcp-architecture-manifest.test.ts tests/unit/mcp-architecture-answers.test.ts`

Run: `rg -n "confidence|自信度|underconfidence|overconfidence" src docs/runbooks/chatgpt-mcp.md docs/specs/skill-compass-lite-design.md docs/showcase/skill-compass-architecture.html`

Expected: test PASS。現行コード・現行資料に機能参照なし。過去spec/plan内の履歴記述だけは検索結果に残ってよい。

- [ ] **Step 6: commitする**

```bash
git add tests/unit/mcp-architecture-manifest.test.ts src/lib/mcp/architecture/manifest.ts docs/specs/skill-compass-lite-design.md docs/showcase/skill-compass-architecture.html docs/superpowers/specs/2026-07-27-practical-today-learning-design.md docs/superpowers/progress/skill-compass-mvp.md
git commit -m "docs: align Skill Compass with confidence-free answers"
```

---

### Task 6: Full verification and production handoff

**Files:**
- Modify only if verification exposes a confidence reference missed by Tasks 1–5.

**Interfaces:**
- Consumes: confidence-free DB、domain、MCP、UI、documentation。
- Produces: migration-ready、deploy-ready implementation。

- [ ] **Step 1: confidence reference auditを実行する**

Run:

```bash
rg -n "confidence|自信度|underconfidence|overconfidence" src tests docs/runbooks/chatgpt-mcp.md docs/specs/skill-compass-lite-design.md docs/showcase/skill-compass-architecture.html
```

Expected: current implementation/test/runbook/showcaseからconfidence参照なし。過去のspec/planは履歴資料として除外する。

- [ ] **Step 2: full static verificationを実行する**

Run: `pnpm typecheck && pnpm lint`

Expected: PASS。

- [ ] **Step 3: full automated testsを実行する**

Run: `pnpm test`

Expected: 全test PASS。

- [ ] **Step 4: production buildを実行する**

Run: `pnpm build`

Expected: Next.js production build PASS。

- [ ] **Step 5: migrationを一時DBまたは明示的に承認された本番DBへ適用する**

Run: `pnpm db:migrate`

Expected: confidence columnだけが削除され、既存answer row数とchoice/reasoning/correct/feedbackが維持される。本番適用はユーザーがdeployを明示した場合だけ行う。

- [ ] **Step 6: WebとMCPをsmoke testする**

Webでchoiceとreasoningだけを送信し、TodayとHistoryへ反映されることを確認する。MCPではconfidenceなしの`submit_today_answer`を呼び、同じユーザー状態へ反映されることを確認する。古い追加confidence fieldを含むcallも拒否されないことを確認する。

- [ ] **Step 7: worktree状態を確認する**

Run: `git status --short`

Expected: Task 1〜5のcommit対象に未コミット変更がない。検証で問題を発見した場合は、その問題を導入したTaskへ戻ってtestを追加し、同Taskの明示済みファイルだけを修正・commitしてからStep 1から再検証する。
