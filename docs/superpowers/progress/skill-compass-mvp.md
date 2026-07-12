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
- Podcast Studio Access基盤: `admin / normal` role、`free / pro` plan、plan default、user override、audit logのschemaとmigrationを追加。
- Podcast Studio Access基盤: entitlement resolver、DBから最新権限を読むcurrent-user境界、admin固定capabilityを追加。
- Podcast Studio Access管理: 日本語admin workspace、role/plan更新、plan default、user override、last-admin保護、監査ログを追加。
- Podcast Studio設定基盤: Podcast nav、Podcast overview、Sourcesごとの収集頻度、生成頻度、言語、Calendar/X input toggleを追加。外部OAuthと音声生成は未接続。
- Podcast Studio Core基盤: `podcast_episodes`、`podcast_jobs`、idempotency key、差し替え可能なJobQueue、ContentCollector、ScriptGenerator、手動生成actionを追加。Providerはdeterministic previewのまま。
- Podcast Studio Worker: queued jobのclaim、Sources snapshot、deterministic台本保存、scripting status、worker CLI、Gemini TTS Provider boundaryを追加。実音声生成は未接続。
- Podcast Studio Audio: Gemini multi-speaker TTSの実Provider、PCMからWAVへの変換、AudioStorage境界、filesystem保存、`podcast_assets` schemaを追加。
- Podcast Studio Delivery: TTS worker接続、local audio保存、asset所有者チェック、Range対応の認証付きaudio endpoint、Podcast画面のaudio playerを追加。R2 Providerは未実装。
- Podcast Studio Storage: R2 S3互換AudioStorage、download response、失敗jobのRetry UI、server-side storage設定を追加。R2 bucket、Keychain credentials、実音声生成とdownload経路を確認済み。
- Podcast Studio Chunk pipeline: `podcast_audio_chunks`を追加し、`(episode_id, chunk_index)`で順序を管理。各chunkのstatus、attempts、R2 storage keyを保存してから最終WAVを結合するようにした。
- Podcast Studio Secrets: macOS KeychainからPodcast R2のAccess Key ID / Secret Access Keyを読む切り替えを追加。productionではenvまたはSecret Managerへ戻せる。
- Podcast Studio CLI config: `podcast:worker`が`.env.local`と`.env`を読み込むようにし、Keychain credentialsをworkerでも利用可能にした。Keychain entryとlocal R2 configは設定済み。
- Podcast Studio live verification: R2 `HeadBucket`、一時objectのwrite/read/delete、Gemini multi-speaker TTSの短文生成が成功。生成音声は検証後に削除し、Podcast episodeへの保存はまだworker実行待ち。
- Podcast Studio end-to-end verification: 実queued jobをworkerで処理し、Gemini TTS、R2保存、`podcast_assets`記録まで成功。episodeは`ready`、jobは`succeeded`。
- Podcast Studio long-form verification: Sourcesを軸にした複数セクションの長尺台本とWAVを生成し、約14MBの音声をR2へ保存。Podcast mobile action layoutも修正し、WAVヘッダーから実音声秒数を保存するようにした。
- Podcast Studio Persistent Audio Queue: 台本生成と音声生成を分離し、音声を2発話単位の永続チャンクqueueとして処理。各worker実行は1チャンクだけをclaimし、全チャンク完了時にWAVを結合する。R2への実チャンク保存まで確認済み。
- Podcast Studio Source-grounded Script: 有効Sourceの本文を取得し、Gemini text modelでSourceごとの具体的な会話を生成。全Sourceの台本内登場、最低発話数、JSON形式を検証し、台本生成失敗時は決定論的な薄い台本へ黙ってfallbackしないようにした。レビュー済み5分42秒音声の生成を確認。
- Podcast Studio Episode Coach: Pro entitlement付きのエピソード単位チャット、会話履歴保存、台本・Sourceを使ったユースケース/サンプルコード回答、任意のGemini TTS音声回答を追加。再生中のnative audioを止めずに質問できるUIを追加。

## 検証snapshot

### Task 4 review follow-up (2026-07-12)

- Today quizの追加問題アクションは、footerとsafe-areaを避けるsticky spacingを使用する。
- quiz card navigation、translation、Today assistantのE2Eは、必要なseed question数を満たさない場合に理由を表示してskipする。
- Reasoningは任意入力であり、空値でもanswer submit actionから保存層へ渡されることをunit testで確認する。

### Task 5 review follow-up (2026-07-12)

- Today quizのmobile E2Eは、390x844 viewportでcard heightをviewportと比較し、card先頭から末尾へscrollした際にcard bottomとbottom-most interactive/content elementがviewport内に収まることを確認する。水平boundsとviewport intersection checksも維持する。
- Focused verification passed: `pnpm exec playwright test tests/e2e/quiz-flow.spec.ts --project=chromium --workers=1 -g 'today keeps one card focused'`; `git diff --check` also passed.

Task 10完了時点のfull verification:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Docker Desktop上のlocal MySQLが正常に起動し、公開可能なstarter contentのseed適用を確認済み。

## 現在のTask

Podcast Studio Core Task 9: 永続音声チャンクqueueのScheduler実行、全チャンク結合、失敗チャンクの再実行を確認する。

## 次のTask

- その後、Podcast生成画面、Sourcesごとの周期設定、Calendar/X連携、JobQueue、TTSを順に実装する。

## MVP後のroadmap

- Podcast Studio（提案段階）: 信頼できるSources、ニュース、任意のCalendar予定、任意の個人SNS情報から、非公開の2人会話形式ブリーフィングを生成する。公開可能な設計は`docs/specs/skill-compass-podcast-studio-design.md`、Phase 1の実装計画は`docs/superpowers/plans/2026-07-10-podcast-studio-access-foundation.md`に記載する。

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
