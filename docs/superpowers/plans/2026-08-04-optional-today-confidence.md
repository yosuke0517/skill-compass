# Optional Today Confidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Todayの自信度を任意の振り返りデータにし、選択肢と理由だけでWeb・MCP・Voice/Liveから回答・同期できるようにする。

**Architecture:** `confidence`は`number | null`として保存・表示を継続するが、回答完成条件とToday scoringから外す。自己評価と実測値のギャップ機能は独立した既存機能として維持する。

**Tech Stack:** Next.js 16、TypeScript 6、React 19、Drizzle ORM、MySQL 8.4、MCP SDK、Zod 4、Vitest 4、Testing Library、Playwright。

## Global Constraints

- confidenceはoptionalな1〜5の整数で、未入力はnull。
- choiceと非空reasoningを回答の必須項目とする。
- confidenceをToday scoreとreview intervalに使用しない。
- 既存confidence値を維持する。
- `calculateGap`、`SkillGap`、self-assessment比較を変更しない。
- ownership、確定済み回答保護、evaluation retryを維持する。
- 過去のimplementation planは書き換えない。

---

### Task 1: Confidence-independent Today scoring

**Files:**
- Modify: `tests/unit/scoring.test.ts`
- Modify: `tests/unit/evaluate-answer.test.ts`
- Modify: `src/lib/scoring/types.ts`
- Modify: `src/lib/scoring/rules.ts`
- Modify: `src/lib/quiz/evaluate-answer.ts`

**Produces:** confidenceを受け取らない`ScoreInput`と`EvaluateAnswerInput`。`SkillGap`と`calculateGap`は維持。

- [ ] scoring testを、正解+good=`0.11/14日`、正解+partial=`0.06/7日`、不正解+partial=`-0.01/2日`へ変更する。既存`calculateGap` testは残す。
- [ ] `pnpm test -- tests/unit/scoring.test.ts tests/unit/evaluate-answer.test.ts`を実行し、confidence必須によりFAILすることを確認する。
- [ ] `ScoreInput`と`EvaluateAnswerInput`からconfidenceを削除し、正誤・reasoning quality・misconceptionだけで計算する。
- [ ] 同じfocused testsを再実行してPASSを確認する。
- [ ] 対象5ファイルだけを`git add`し、`git commit -m "refactor: decouple Today confidence from scoring"`でcommitする。

---

### Task 2: Nullable persistence and answer domain

**Files:**
- Modify: `tests/integration/submit-answer.test.ts`
- Modify: `tests/unit/today-service.test.ts`
- Modify: `src/lib/quiz/submit-answer.ts`
- Modify: `src/lib/quiz/today-service.ts`
- Modify: `src/db/schema.ts`
- Create: next Drizzle migration after `0016`
- Modify: `drizzle/meta/_journal.json` and generated snapshot

**Produces:** `confidence?: number`のservice input、`confidence: number | null`のstored/read answer。

- [ ] confidenceなしとconfidenceありのsubmission testsを追加し、null raw answerのfinalize、既存値の保存、ownershipを検証する。
- [ ] focused testsを実行し、現行必須型によりFAILすることを確認する。
- [ ] domain inputをoptional、saved answerをnullableにし、evaluateAnswerへconfidenceを渡さない。null finalize比較は`isNull`またはnull-safe equalityを使う。
- [ ] schemaを`confidence: int("confidence")`へ変更し、`pnpm db:generate`でNOT NULLを外すmigrationを生成する。既存値を更新・削除するSQLがないことを確認する。
- [ ] `pnpm test -- tests/integration/submit-answer.test.ts tests/unit/today-service.test.ts`を再実行する。
- [ ] 対象ファイルと生成migrationだけをcommitし、messageを`refactor: make Today confidence optional`とする。

---

### Task 3: Optional Learning MCP and SYNC PACK

**Files:**
- Modify: `tests/unit/mcp-tools.test.ts`
- Modify: `tests/integration/mcp-route.test.ts`
- Modify: `src/lib/mcp/server.ts`
- Modify: `docs/runbooks/chatgpt-mcp.md`

**Produces:** `confidence?: number`の`submit_today_answer` schema。

- [ ] MCP testへconfidenceなしの成功、confidenceありの成功、0/6/小数の拒否を追加する。
- [ ] focused testsが現行required schemaでFAILすることを確認する。
- [ ] schemaを`z.number().int().min(1).max(5).optional()`へ変更し、service callには値がある場合だけconfidenceを含める。
- [ ] runbookのVoice進行ではconfidenceを要求せず、SYNC PACKの必須4項目からconfidenceを外す。自発的に得た場合だけoptional行として扱う。
- [ ] focused testsをPASSさせ、`feat: allow confidence-free Today sync`でcommitする。

---

### Task 4: Optional Web UI and history

**Files:**
- Modify: `tests/unit/quiz-question-card.test.tsx`
- Modify: `tests/unit/history.test.ts`
- Modify: `tests/e2e/history.spec.ts`
- Modify: `src/app/actions/quiz.ts`
- Modify: `src/components/quiz/confidence-input.tsx`
- Modify: `src/components/quiz/quiz-question-card.tsx`
- Modify: `src/app/globals.css` only if copy/layout needs adjustment
- Modify: `src/lib/quiz/get-today-quiz.ts`
- Modify: `src/lib/quiz/web-today-quiz.ts`
- Modify: `src/lib/history/get-history.ts`
- Modify: `src/app/(app)/history/page.tsx`

**Produces:** 初期選択なしのoptional confidence UIと、nullable confidence read models。

- [ ] card testでconfidence radioが5個あるがcheckedは0個、optional表示があることをassertする。history testでvalueあり/null両方を検証する。
- [ ] focused testsを実行し、既定3選択とnon-null history型によりFAILすることを確認する。
- [ ] `ConfidenceInput`のdefaultCheckedを削除してOptional copyを追加する。Server Actionは空をundefined、値ありなら1〜5整数として扱い、choice/reasoningだけを必須にする。
- [ ] Today/history DTOを`number | null`へ変更し、history UIは値ありの場合だけ表示する。
- [ ] unit testsと可能ならhistory E2Eを実行する。
- [ ] 対象ファイルを`refactor: make Today confidence optional in the web UI`でcommitする。

---

### Task 5: Current architecture and product documentation

**Files:**
- Modify: `tests/unit/mcp-architecture-manifest.test.ts`
- Modify: `src/lib/mcp/architecture/manifest.ts`
- Modify: `docs/specs/skill-compass-lite-design.md`
- Modify: `docs/showcase/skill-compass-architecture.html`
- Modify: `docs/superpowers/specs/2026-07-27-practical-today-learning-design.md`
- Modify: `docs/superpowers/progress/skill-compass-mvp.md`

**Produces:** optional reflection metadataとself-assessment gapの区別が明確な現行説明。

- [ ] manifest testでconfidenceをoptional reflection metadataとして説明し、score入力に含めないことをassertする。
- [ ] focused manifest testsが旧説明でFAILすることを確認する。
- [ ] manifest、Lite設計、showcase、現行仕様・進捗を更新し、self-assessment gapが別機能として維持されることを明記する。
- [ ] manifest testsをPASSさせ、`docs: document optional Today confidence`でcommitする。

---

### Task 6: Full verification and deployment readiness

- [ ] `rg -n "confidence|自信度" src tests docs/runbooks/chatgpt-mcp.md docs/specs/skill-compass-lite-design.md docs/showcase/skill-compass-architecture.html`で、必須扱い・score依存が残っていないことを監査する。
- [ ] `pnpm typecheck && pnpm lint`をPASSさせる。
- [ ] `pnpm test`を全件PASSさせる。
- [ ] `pnpm build`をPASSさせる。
- [ ] migrationを一時DBで検証し、既存confidence値が保持され、null回答を保存できることを確認する。
- [ ] Webでchoice+reasoningのみ、MCPでconfidenceなし/ありの両方をsmoke testする。
- [ ] `git status --short`で未関連のREADME、Stacked PR文書、`.pnpm-store`以外に未コミット変更がないことを確認する。

