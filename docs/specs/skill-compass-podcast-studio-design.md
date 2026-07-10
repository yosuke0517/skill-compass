# Skill Compass Podcast Studio 設計

ステータス: 公開可能な提案段階の設計

最終確認日: 2026-07-10

## 目的

Podcast Studioは、信頼できるエンジニアリング情報源、最新ニュース、選択したSNS投稿、ユーザーのカレンダーから、非公開の2人会話形式の音声ブリーフィングを生成する。通勤や散歩中のハンズフリー学習を実現しながら、出典の追跡、ユーザーのプライバシー、予測可能な運用コストを維持することを目的とする。

本機能はMVP後の構想である。この文書は将来のアーキテクチャを説明するものであり、実装済みであることを示すものではない。

## プロダクト原則

- 一次情報を事実確認の基準にする。
- ニュースとSNS投稿は、単独の根拠ではなく、発見と世間の反応を知る材料として扱う。
- 非公開の入力情報はデフォルトで非公開に保つ。
- 外部連携では、機能ごとに必要最小限のOAuth scopeだけを要求する。
- 時間のかかる生成処理は、再開可能かつ観測可能で、安全に再試行できるようにする。
- LLM、音声合成、ストレージ、キュー、カレンダー、SNS連携は差し替え可能にする。
- 従量課金されるProviderには必ず利用上限を設ける。
- 外部公開の前に、adminによる明示的な承認を必須にする。

## ユーザー体験

モバイルの下部ナビゲーションに5番目の項目を追加する。

```txt
Dash / Today / Podcast / Archive / Settings
```

Podcastページには以下を表示する。

- 最新エピソードと再生コントロール
- アプリ内を移動しても再生を続けるミニプレイヤー
- 現在の生成進捗
- 過去のエピソード
- 手動生成
- 再生とダウンロード
- 出典と生成メタデータ

Podcast設定は別ページに分け、以下を設定できるようにする。

- 生成時刻、タイムゾーン、曜日
- 目標再生時間
- デフォルトONのSources利用設定
- ニュース、SNS、カレンダーの入力設定
- デフォルトの日本語出力
- adminのみが利用できる英語版の追加生成
- オプションのベータ機能として認証付きprivate RSS

Skill Compass内のプレイヤーを正式な再生手段とし、認証済みセッションを要求する。iPhoneのバックグラウンド再生とApple Podcastsでの認証付きprivate RSSは、リリース前に実機検証を行う。

## Sourceと生成スケジュール

Sourceを取得する頻度と、Podcastを生成する頻度は別の設定として管理する。

各Sourceには以下を設定する。

- Podcastで利用するか
- Source種別
- 信頼度Tier
- 毎日、3日ごと、毎週、14日ごと、毎月などの取得間隔
- 最終取得成功日時
- 次回取得予定日時

各ユーザーは、Podcastの生成頻度を毎日、平日のみ、毎週、手動から選択できる。生成時刻になったら、取得対象となっている全入力を1本のブリーフィングへまとめる。Sourceごとに別のエピソードは作らない。

ニュース、Source更新、SNS投稿、カレンダー予定のすべてが0件なら生成をスキップし、理由を記録する。カレンダー予定だけが存在する場合は、短いブリーフィングを生成できる。

## コンテンツ入力

### Sourcesとニュース

公式ドキュメント、仕様、リリースノート、メンテナーによる情報を事実の基準にする。ニュースやコミュニティ情報は、背景説明と話題発見に利用する。生成した台本には出典を残し、確認された事実と論評を区別する。

生成に必要な範囲の抜粋だけを、Source ID、URL、取得日時、ハッシュとともに保存する。第三者の記事全文は複製しない。

### Google Calendar

Calendar連携にはユーザーごとのGoogle OAuthを使用する。デフォルトでは予定の開始時刻とタイトルだけを読み上げる。場所、説明、参加者は、それぞれユーザーが明示的にONにした場合だけ使用する。

ユーザーは対象カレンダーと期間を選択できる。初期の期間選択肢は、今日、明日、今後7日間とする。モデルへ送る前にCalendar情報を必要最小限へ縮小する。

### Xの公開情報

公開アカウントとキーワードによる情報収集には、アプリケーション単位のX API連携を使用する。この入力を使うだけなら、ユーザー自身のXアカウント連携は不要とする。

公開されたX投稿は信頼度の低い補助情報として扱い、出典を付けて要約する。事実を断定する唯一の根拠にはしない。

### Xの個人情報源

個人のX情報をPodcastへ利用する機能はPro entitlementとする。ProユーザーはOAuth 2.0 Authorization Code with PKCEでXを連携し、以下を個別に有効化できる。

- 時系列順のホームタイムライン
- ブックマーク

Xとの接続後も、両方の入力はデフォルトOFFとする。ユーザーは対象期間、取得件数上限、除外アカウント、除外語句、ブックマーク優先度を設定できる。

個人Sourceの収集では読み取りscopeだけを要求する。投稿scopeは別の同意フローとし、adminが投稿機能を有効にした場合だけ要求する。

取得した個人SNSデータの生データは短期間だけ保持する。エピソードの出典とSource IDは、エピソードが削除されるまで保持する。

## 生成パイプライン

Podcast生成には、MySQLを使用した永続的なジョブパイプラインを採用する。

```txt
手動操作またはscheduler
          |
          v
 episodeとjobを作成
          |
          v
queued -> collecting -> scripting -> synthesizing -> ready
```

Webリクエストはジョブを登録して短時間で応答する。workerは待機中のジョブを取得してleaseを記録し、1段階を実行して結果を永続化した後、次の段階へ進める。

後続段階が失敗しても、完了済みの段階を繰り返さない。たとえば音声合成に失敗した場合、Source収集や台本生成をやり直さず、音声合成だけを再試行する。

キューには以下を保存する。

- job種別とステータス
- episodeとuserの所有関係
- 試行回数
- lease ownerとlease期限
- 次回再試行日時
- 秘密情報を除いたエラーコード
- 作成、開始、完了日時

同じユーザー、ローカル日付、言語、スケジュール起点の重複エピソードはidempotency keyで防止する。workerは行ロックまたは原子的なclaim処理を使い、同時に複数のworkerが同じjobを所有しないようにする。

初期実装では分散メッセージブローカー全体を再現しない。`JobQueue`境界を設け、将来`MySqlJobQueue`を`SqsJobQueue`へ差し替えても生成サービスを変更せずに済むようにする。

## パイプラインの各段階

### Collecting

そのエピソードで利用対象となる入力を読み込み、Sourceの信頼度とプライバシールールを適用し、重複を除去して、上限付きの入力snapshotを保存する。

### Scripting

出典付きの2人会話形式の日本語台本を生成する。adminが英語版を有効にした場合、同じ入力snapshotから英語台本を作り、別のepisode assetとして管理する。

### Synthesizing

Speech Providerが台本を2人話者の音声へ変換する。初期候補はGeminiのmulti-speaker TTSだが、model IDはアプリケーションロジックではなく設定として扱う。

### Ready

ready状態のエピソードは再生、ダウンロード、または有効化済みの認証付きfeedから利用できる。音声バイナリはMySQLへ保存せず、`AudioStorage` Providerへ保存する。

### Publishing

外部公開は生成パイプラインから分離する。

```txt
ready -> admin確認 -> approved -> publishing -> published
```

外部公開に失敗しても、非公開エピソードはready状態のまま利用できる。

## 差し替え可能な境界

```txt
ContentCollector    Sources / news / X / calendar
ScriptGenerator     Geminiまたは別のテキストモデル
SpeechSynthesizer   Gemini TTSまたは別の音声サービス
AudioStorage        ローカルファイル / オブジェクトストレージ
SocialPublisher     X / 将来のSNS
JobQueue            MySQL / 将来のmanaged queue
```

Providerのcontractは構造化された結果と正規化済みのエラーコードを返す。Provider固有のpayloadをpage componentやepisodeの状態遷移へ漏らさない。

## Model方針

最終確認日時点で、GeminiはPodcast形式に利用できるmulti-speaker TTS modelを提供している。初期開発ではコストを重視したFlash TTS modelを候補とし、より高品質なmodelへ設定で切り替えられるようにする。

TTSは完成済みの台本を受け取り、音声を出力する。したがって台本生成と音声合成は、別のProvider呼び出し、別のjob段階として管理する。

model名、料金、quota、preview状態は変更される可能性がある。これらは設定と運用ドキュメントで管理し、プロダクトの固定的な保証にはしない。

## アクセスモデル

管理権限と商用プランを別の概念として扱う。

- `role`: `admin`または`normal`。将来のrole追加を許容する。
- `plan`: `free`または`pro`。将来のplan追加を許容する。
- `entitlement`: planのデフォルト値とユーザー個別上書きによって付与する機能識別子。

初期のcapability IDは以下とする。

- `podcast.sample.view`
- `podcast.generate`
- `podcast.download`
- `calendar.connect`
- `x.personal_sources`
- `x.publish`
- `access.manage`

まずplanのデフォルト値を評価し、その後ユーザー個別の上書きを適用する。最後の有効なadminから管理権限を外す操作は、同じUIから実行できないようにする。

初期ポリシーは以下とする。

- Freeユーザーは指定されたサンプルを表示、再生できる。
- Proユーザーは生成、Calendar連携、個人X Source連携、再生、ダウンロード、対象となる非公開配信機能を利用できる。
- adminはPro相当の機能に加え、アクセス管理、連携設定管理、英語版生成、承認後のX投稿を利用できる。

決済処理はPodcast Studioの初期実装には含めない。決済自動化より先にplanを割り当てられるデータモデルを用意する。

## admin向け画面

管理設定にはPC向けの3ペインレイアウトを採用する。

```txt
左ナビゲーション | userまたは設定一覧 | 選択項目の詳細
```

Access、Plans、Users、Integrations、Auditを用意する。モバイルでは詳細ペインを別のドリルイン画面として表示する。

adminはplanのentitlement初期値とユーザー個別上書きを編集できる。他ユーザーのエピソードについては障害調査用メタデータだけを閲覧でき、通常は台本、音声、Calendar内容を閲覧できない。

## OAuthとSecret

Google Calendarと個人X連携にはユーザーごとのOAuthを使用する。Skill CompassがGoogleやXのパスワード入力を求めることはない。

OAuthではstate検証と、利用可能な場合はPKCEを使用する。読み取り権限と投稿権限は別の同意フローとする。連携解除または必要なentitlementの喪失後は、以降の収集と投稿を停止する。

OAuth tokenとProvider API keyは、認証付き暗号で暗号化して保存する。暗号鍵はデプロイ環境のSecretから受け取り、アプリケーションDBには保存しない。保存済みSecretをUIへ再表示しない。将来の再暗号化に備えてkey IDを保持する。

ログインパスワードやprivate feedのパスワードなど、復号する必要がない認証情報はsalt付きhashとして保存する。

認証情報、個人アカウント、実際のcallback値、非公開のSource一覧、SNS投稿運用の詳細はpublic repositoryへ含めない。

## Xへの投稿

Xは通常のPost mediaとして音声ファイル単体を受け付けない。公開用pipelineでは、静止画、字幕、長さを制限した音声抜粋から短いMP4 audiogramを生成し、全文を聴けるエピソードへのリンクをPostへ含める。

adminは以下を確認する。

- 選択された音声抜粋
- 生成画像またはtemplate
- 字幕
- Post本文
- 投稿先アカウント

明示的な承認後だけ投稿する。自動投稿は将来のopt-in機能とし、初期リリースには含めない。

X APIは従量課金のため、ユーザーごとの日次取得件数上限、全体の月額予算、取得済みSourceのcache、予算到達時のhard stopを設ける。

## 再生と非公開配信

認証付きSkill Compass playerを主要な配信経路とする。音声endpointではepisodeの所有権を検証し、seekと再開に必要なHTTP byte-range requestへ対応する。

認証付きprivate RSSはオプションのベータ機能とする。ユーザーごとに失効可能なfeed認証情報を発行する。公開directoryへの登録を防ぎ、feedにはCalendar内容ではなく一般的なepisode metadataだけを出力する。

Podcast clientは将来のepisodeを取得するために再利用可能な認証情報を保持する必要がある。そのためprivate RSSは短時間のWeb sessionと同等の安全性ではない。iPhoneでの互換性と認証情報失効を検証した後にだけ提供する。より強いsession制御を優先するユーザーはRSSを無効のままにし、Skill Compass playerを使用できる。

## データモデル

想定する論理tableは以下のとおり。

- `users`: role、plan、status
- `entitlements`: capability一覧
- `plan_entitlements`: planの初期値
- `user_entitlement_overrides`: ユーザー個別の許可と拒否
- `connections`: 暗号化したOAuth connection metadata
- `podcast_settings`: schedule、timezone、duration、language、有効なinput
- `source_podcast_settings`: Sourceごとの利用設定と取得間隔
- `podcast_episodes`: owner、pipeline status、source snapshot、retention status
- `podcast_assets`: language、storage reference、media type、duration、size
- `podcast_jobs`: 永続queueとretry状態
- `podcast_feed_credentials`: 失効可能なprivate feed認証
- `audit_logs`: security上重要な操作と管理操作

将来の追加で不要なschema変更を発生させないため、roleとcapability IDにはMySQL enumを使用しない。

## 保持期間と緊急閲覧

有効なepisode内容はユーザーが削除するまで保持する。削除後30日間は復元可能とし、その後完全に削除する。audit metadataは1年間保持する。

特定recordへlegal holdを設定した場合、scheduled deletionを停止する。legal hold自体は通常の内容閲覧権限を与えない。

緊急の内容閲覧はbreak-glass操作とし、以下を必須にする。

- 必要なcapabilityを持つadmin
- 直近の再認証
- 閲覧理由の記録
- 改変しにくいaudit event
- デプロイ先の方針に沿った通知または事後確認

public設計にはcontrolの目的を記載するが、非公開の運用認証情報やincident runbookは含めない。

## エラー処理

- 取得に失敗したSourceは、他に十分な材料があれば除外して生成を続ける。
- CalendarまたはXの認証期限切れは、その入力だけを停止して再接続を案内する。
- 台本生成と音声生成は間隔を広げながら、固定回数まで再試行する。
- failed jobは完了済み段階を保持し、安全な再試行操作を表示する。
- leaseを失ったworkerは、新しいownerの結果を上書きできない。
- 予算上限へ到達した場合、新しい従量課金callを停止し、budget-blocked状態を記録する。
- 投稿に失敗しても、非公開episodeはreadyかつ再生可能な状態を保つ。
- storageへの保存に失敗したassetをreadyとして記録しない。

## テスト方針

Unit testでは以下を検証する。

- entitlementの解決
- Source scheduleと信頼度順序
- episodeの状態遷移
- retry間隔と最終失敗
- idempotency keyの生成
- retentionとlegal holdの判定
- 予算計算

Integration testでは以下を検証する。

- MySQLでの原子的なjob claimとlease期限切れ
- mock HTTP responseを使ったProvider contract
- OAuth stateとPKCEの検証
- token暗号化とkey ID
- 認証付き音声のrange request
- private feed認証と失効
- audit logの作成

E2E testでは以下を検証する。

- Free、Pro、adminのアクセス境界
- モバイルでの生成、進捗、再生、ダウンロード
- mock Providerを使ったCalendarとXの連携状態
- PCでのアクセス管理
- adminによる確認と投稿承認

リリース前の手動確認では以下を検証する。

- iPhoneのバックグラウンド再生
- Apple Podcastsでの認証付きprivate RSS
- Google OAuth callback設定
- X OAuth scopeとtoken refresh
- X audiogramのuploadとprocessing
- process中断後のworker復旧

CIでは本番認証情報や実際のSNS投稿を使用しない。

## 実装フェーズ

1. Access基盤: role、plan、entitlement、PC管理画面。
2. Podcast core: 手動job、台本、2人話者音声、再生、ダウンロード。
3. Scheduled briefing: Source取得間隔、自動生成、Calendar。
4. Personal sources: 予算制御付きのPro向けX timelineとbookmark。
5. Background delivery: 認証playerの強化とprivate RSS beta。
6. admin publishing: 英語版、audiogram、確認、X投稿。
7. Retention and operations: legal hold、break-glass、audit review。

Phase 1の詳細な実装手順は[Podcast Studio Phase 1: Access基盤 実装計画](../superpowers/plans/2026-07-10-podcast-studio-access-foundation.md)に記載する。

## Operator設定チェックリスト

実装時には、source codeだけでは完了できない設定作業を明示する。

- Gemini API keyと利用上限を設定する。
- アプリケーション暗号化用Secretを作成する。
- Google Calendar APIを有効化する。
- Google OAuth consent screen、client、scope、callback URLを設定する。
- X developer applicationを作成または設定する。
- X OAuth scope、callback URL、credit、利用上限を設定する。
- 本番の音声storageを選択して設定する。
- schedulerとjob workerを起動する。
- private RSSの検証前にHTTPS endpointを公開する。
- iPhoneのバックグラウンド再生とprivate feedの互換性を確認する。

repositoryにはplaceholderと設定手順だけを置く。実値はデプロイ環境のSecret管理へ保存する。

## 公開リファレンス

- [Gemini text-to-speech generation](https://ai.google.dev/gemini-api/docs/speech-generation)
- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Google Calendar API authorization](https://developers.google.com/workspace/calendar/api/auth)
- [X OAuth 2.0 Authorization Code with PKCE](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code)
- [X home timelines](https://docs.x.com/x-api/posts/timelines/introduction)
- [X bookmarks](https://docs.x.com/x-api/posts/bookmarks/introduction)
- [X API pricing](https://docs.x.com/x-api/getting-started/pricing)
- [Apple Podcasts private RSS distribution](https://podcasters.apple.com/support/5108-how-apple-podcasts-distributes-your-shows-to-listeners)

## public repositoryの境界

本設計はpublic repositoryへ掲載できる内容に限定している。認証情報、個人アカウント識別子、非公開の環境情報、非公開Source一覧、未公開prompt、incident runbook、SNS運用戦略は含めない。
