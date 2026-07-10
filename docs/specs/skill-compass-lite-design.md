# Skill Compass Lite設計

ステータス: 公開可能な設計概要

## 目的

Skill Compassは、AI支援時代のエンジニアに向けた個人用の成長支援アプリである。基礎の練習、現代的な技術トピックへのcatch-up、弱点の特定、自己評価と実測値の差の追跡を支援する。

アプリは次の単純なloopを中心に設計する。

1. 現在のskill状態を確認する。
2. 短い適応型quizへ回答する。
3. すぐにfeedbackを受け取る。
4. 実測skill scoreを更新する。
5. 将来の復習に使えるlearning noteを保存する。

## Core Product

MVPは独立したWeb applicationとして提供し、以下を含む。

- dashboard-firstの体験
- 画面に表示する5つのskill軸
  - Frontend
  - Backend
  - Infrastructure
  - SQL
  - LLM
- subskillと具体的なconceptの内部追跡
- 1日5問のquiz
- 週次summary
- 月次self-assessment review
- Sourceに基づくquestion生成
- Markdown形式のknowledge export

## Skill Model

広いskill領域と具体的な学習対象を分離する。

```txt
Category: Frontend
  Tag: TypeScript
    Concept: satisfies operator
    Concept: const type parameters
  Tag: Design System
    Concept: design token
    Concept: component variant

Category: Infrastructure
  Tag: Networking
    Concept: NAT
    Concept: reverse proxy
    Concept: DNS
```

- `Category`はdashboardに表示する大分類。
- `Tag`はscoringとquiz balanceに使うsubskill。
- `Concept`は、ユーザーが誤解、復習、習得できる具体的な対象。

Conceptは複数のTagと関係する可能性があるため、data modelはmany-to-many relationshipへ対応する。

例:

- `MCP`はLLM workflow、frontend implementation、developer toolingに関連する。
- `API contract`はbackend design、frontend integration、testingに関連する。
- `index design`はSQLとbackend performanceに関連する。

## 難易度モデル

難易度は3段階とする。

- `beginner`
  - 用語、役割、基本的な違いを説明できる。
  - 例: NAT、DNS、reverse proxyの違いを識別する。
- `intermediate`
  - 現実的なengineering判断へconceptを適用できる。
  - 例: testing strategyを選択し、database indexのtrade-offを説明する。
- `advanced`
  - 新しい仕様と現在のbest practiceを理解する。
  - 選択肢を比較し、trade-offを説明し、teamやLLMを正しい実装へ導ける。

## Daily Quiz Flow

1日分は5問で構成する。

推奨する内訳:

- 弱点を補強するquestionを2問
- 強みを伸ばすquestionを1問
- 最新技術へのcatch-up questionを1問
- 出題の少ないskill、またはself-assessment gapが大きい領域から1問

各回答には以下を含める。

- 4択の回答
- confidence score
- 短い自由記述のreasoning

回答後、アプリは以下を評価する。

- 正誤
- reasoningの品質
- 誤解しているconcept
- 次回review時期
- score update

## Score Update

scoring全体をLLMへ委譲しない。LLM feedbackは構造化された評価metadataを返せるが、最終的なscore変更は決定論的なapplication ruleで行う。

rule例:

- 正解、高confidence、良いreasoning: scoreを増やす。
- 正解、低confidence: 小さく増やし、review候補として残す。
- 不正解だがreasoningが近い: 小さな減点または変更なし。
- 重大な誤解を伴う不正解: 大きく減点し、早めにreviewする。
- 正解を繰り返した場合: review intervalを延ばす。

scoreはCategory、Tag、Concept単位で追跡する。dashboardに表示するCategory scoreは、下位scoreから算出する。

## Self-Assessment

実測performanceと自己認識の両方を追跡する。

onboardingでは以下を行う。

1. 5つのCategoryを自己評価する。
2. 任意でTag単位の自己評価を行う。
3. diagnostic quizへ回答する。
4. 自己評価と実測performanceのgapを計算する。

月次reviewではself-assessmentを更新し、以下を振り返る。

- 過小評価している領域
- 過大評価している領域
- 想定より早く成長している領域
- 集中的な練習が必要な領域

## Source方針

questionはSourceに基づいて生成する。

アプリは以下をサポートする。

- 固定された信頼できるSource
- ユーザーが追加するURL
- Sourceの信頼度Tier
- 公式確認status

推奨する信頼度Tier:

- Tier 1: 公式documentation、release note、specification、RFC
- Tier 2: 公式blog、maintainerによる資料
- Tier 3: community article、technical blog
- Tier 4: social post、未検証のcommentary

community articleは発見と実践的な説明に有用だが、quizの正解根拠は可能な限り公式または信頼度の高いSourceで確認する。

## Knowledge Export

learning artifactをMarkdownとしてexportし、portableで読みやすい状態を保つ。

推奨構造:

```txt
Skill Compass/
  daily/
  weekly/
  monthly/
  concepts/
  sources/
```

Daily logには以下を含める。

- 回答したquestion
- 正誤
- confidence
- reasoning
- feedback
- score change
- 次回review日

Concept noteには以下を含める。

- 現在の理解
- よくある誤解
- 関連concept
- quiz history
- Source

Weekly logには以下を含める。

- score change
- 弱点
- 強み
- 翌週のfocus

Monthly logには以下を含める。

- self-vs-measured gap
- reflection
- 翌月のfocus

## MVP画面

必要な画面:

- Login
- Dashboard
- Today's Quiz
- Skills
- Concepts
- Sources
- Settings

Dashboardには以下を表示する。

- 5軸のradar chart
- 今日のquiz進捗
- streak
- 週次accuracy
- 上位の弱点
- 改善中のTag
- self-vs-measured skill gap
- 週次、月次review prompt

## 技術方針

MVPの想定stack:

- Next.js App Router
- TypeScript
- MySQL
- Drizzle ORM
- local deployment用のDocker Compose
- 差し替え可能なLLM Provider interface
- 差し替え可能なMarkdown note writer
- application-level commandとして実装するscheduled job

scheduled jobはportableにする。self-host時はlocal schedulerから実行し、将来は同じcommandをcloud schedulerから実行できるようにする。

jobには以下を含める。

- daily quiz preparation
- Source ingestion
- weekly summary
- monthly self-assessment prompt
- Markdown export sync

## エラー処理

- question生成に失敗した場合、既存questionを再利用する。
- answer evaluationに失敗した場合、answerを保存して後から再試行する。
- Source取得に失敗した場合、失敗statusを付け、未検証の事実を断定しない。
- Markdown exportに失敗してもDB stateを維持し、exportだけを再試行する。
- 利用上限へ到達した場合、新しい生成を停止し、既存questionまたは単純なscoringへfallbackする。

## テスト方針

以下をtest対象とする。

- scoring logic
- quiz selection logic
- self-assessment gap calculation
- Markdown generation
- database integration
- authentication
- quiz E2E flow
- mock LLM responseを使うscheduled job behavior

## 将来機能: Podcast Studio

Lite MVP後に、Sourceに基づく学習内容から非公開の2人会話形式audio briefingを生成できるようにする。提案中のPodcast Studioは、信頼できるSources、最新ニュース、任意の個人SNS情報、ユーザーのCalendar予定を組み合わせる。

再開可能なscript、audio生成のための永続job pipelineを採用し、roleとplan entitlementを分離する。外部連携は差し替え可能なProviderの背後へ置き、SNS投稿前には明示的な承認を必須にする。

公開設計とvisual overview:

- [Podcast Studio設計](skill-compass-podcast-studio-design.md)
- [Podcast Studioアーキテクチャショーケース](../showcase/podcast-studio.html)

## public repositoryの境界

この文書はpublic repositoryへ掲載できる情報だけで構成する。以下は含めない。

- 個人のlocal path
- 非公開project名
- 個人用automationの詳細
- 認証情報
- 未公開の運用log
- 機微なbusiness context
