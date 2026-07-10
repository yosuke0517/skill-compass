# Skill Compass MVP進捗

この文書は、コンテキスト圧縮後も実装を継続できるようにする、公開可能な引き継ぎ記録である。認証情報、個人のローカル環境、非公開のraw spec、API key、SNS運用情報、未公開の運用コンテキストは記載しない。

## 現在の状態

- Workspace: repository root（`skill-compass`）
- Branch: `codex/skill-compass-mvp`
- プロダクト仕様: `docs/specs/skill-compass-lite-design.md`
- 実装計画: `docs/superpowers/plans/2026-07-08-skill-compass-mvp.md`
- Package manager: pnpm
- App stack: Next.js App Router、TypeScript、MySQL、Drizzle ORM、Docker Compose
- Auth: salt付きpassword hashを使うDB user loginと、署名付き24時間session
- UI方針: mobile-first dashboard shell。desktopではmobile app surfaceを中央に配置

## 完了済み

- Task 1: Next.js appとtoolingをscaffold。
- Task 2: Docker Compose、Drizzle config、環境変数validation、database clientを追加。
- Task 3: Drizzle schema、初期migration、公開可能なseed dataを追加。
- Package manager移行: npm lockfileからpnpm workspaceとlockfileへ移行。
- Task 4: authentication、session helper、login action、保護app proxy、login E2Eを追加。
- Task 5: 決定論的なscoring ruleとself-vs-measured gap計算を追加。
- Task 6: 差し替え可能なLLM評価Providerとanswer evaluation orchestrationを追加。
- Task 7: 決定論的なdaily quiz選択を追加。
- Task 8: 認証済みdashboardを実DB summaryへ接続。
- Task 9: daily quiz page、answer submission、feedback、score updateを追加。
- Task 9.5: cache-firstの日本語quiz card翻訳と、任意のClaude CLI Providerを追加。
- Task 10: Skills、Concepts、Sources、Settingsの管理画面を追加。
- Mobile UI改善: loginとdashboard placeholderをmobile-firstの外観へ更新。
- Auth更新: 固定環境変数passwordから、DB user password hashと招待対応tableへ移行。
- 履歴archive: `/history`で回答済みToday quizを年、月、日ごとに閲覧可能にした。
- Mobile navigation: Dash、Today、Archive、Settingsの4項目へ整理。
- Today assistant: Gemini対応、会話履歴、mobile Safari向け固定表示とdrag移動を追加。

## 検証snapshot

Task 10完了時点のfull verification:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Docker Desktop上のlocal MySQLが正常に起動し、公開可能なstarter contentのseed適用を確認済み。

## 現在のTask

Task 11: 差し替え可能なMarkdown note writerとexport flowを追加する。

## 次のTask

- Task 12: scheduled jobの抽象とCLI commandを追加する。
- Task 13: document、safety check、public repository hygieneを仕上げる。

## MVP後のroadmap

- Podcast Studio（提案段階）: 信頼できるSources、ニュース、任意のCalendar予定、任意の個人SNS情報から、非公開の2人会話形式ブリーフィングを生成する。公開可能な設計は`docs/specs/skill-compass-podcast-studio-design.md`に記載する。

## 主要commit

- `b0774ab` MVP実装計画
- `1c2c6ea` app scaffold
- `88ace4b` local database設定
- `e8e3653` Skill Compass data model
- `b73a066` pnpm移行
- `945fa4d` 固定password authentication
- `b107900` 決定論的scoring rule
- `597040a` daily quiz selection
- `8163956` dashboard-first app shell
- `450a0a0` daily quiz flow
- `010e640` quiz履歴archive
- `59ca3c3` database user authentication
- `7dc3fa8` mobile Safari向けToday assistant表示修正
- `bef3bbf` Podcast Studio設計とHTML showcase
