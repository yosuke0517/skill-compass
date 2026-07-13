# Skill Compass Quiet Technical Studio UI設計

## 目的

既存のSkill Compassを、毎日使いやすいモバイルファーストのエンジニア学習アプリへ刷新する。
見た目だけを装飾的に変更するのではなく、問題を解く、理解を深める、音声で復習するという主要な行動がすぐ見つかる情報設計を優先する。

## デザインコンセプト

方向性は「Quiet Technical Studio」とする。

- 知的で落ち着いているが、無機質すぎない
- 白い作業面と深いグリーンの信頼感を基調にする
- ブルーはLLM、リンク、現在の操作状態に限定して使う
- 進捗や理解度は大きな装飾ではなく、細いバー、小さな数値、短い状態ラベルで示す
- カードを入れ子にせず、ページの余白と区切りで階層を作る
- 重要な操作は画面下部の固定ナビゲーションに隠さず、コンテンツの近くに置く

## 対象ユーザーと最初の仕事

対象は、仕事の合間や移動中にiPhoneでエンジニアリング知識を復習するユーザー。
Today画面の最初の仕事は「今すぐ1問に集中して答えること」とする。
Dashboardは次にやることを決める場所、Podcastは耳で復習する場所、Archiveは過去の学習を探す場所とする。

## トークン

### 色

| Token | 値 | 用途 |
| --- | --- | --- |
| `--canvas` | `#f4f7f5` | アプリ全体の背景 |
| `--surface` | `#ffffff` | 問題、設定、再生領域 |
| `--ink` | `#10201b` | 見出し、主要テキスト |
| `--muted` | `#65736e` | 補助テキスト |
| `--accent` | `#087f6b` | 主操作、正答、選択中の状態 |
| `--accent-dark` | `#075b4e` | 主操作のpressed状態、強調テキスト |
| `--signal` | `#246fe5` | LLM、リンク、情報状態 |
| `--warning` | `#a56a12` | 未回答、注意、保留 |
| `--border` | `#d8e2de` | 境界線、区切り |

紫一色、茶色一色、強いグラデーション、装飾目的のorbは使用しない。

### 文字

- Display: `Plus Jakarta Sans`相当の丸みを持つsans-serif。画面タイトルと主要な数値に限定する
- Body: `Inter`相当のsans-serif。問題文、説明、フォームに使う
- Utility: `IBM Plex Mono`相当を数値、日付、状態コードに限定して使う
- 見出しは大きさよりも行間とweightで階層を作る
- モバイル本文は16pxを下限とし、長い英語の単語は折り返して収める

### 形と余白

- 基本spacingは4px刻み、主要な区切りは12px、16px、24px
- 通常の要素はradius 8px、主要な操作面だけ12px
- 影は低い拡散の1種類に限定する
- 固定要素はsafe-areaを考慮し、コンテンツと重ならない余白を確保する

## 共通シェル

- 上部に常設のセッション情報や重複したページタイトルは置かない
- 画面の現在地は固定bottom navigationと画面内の小さな見出しで伝える
- bottom navigationは5項目を1行に固定し、ラベルを折り返さない
- アイコン、ラベル、active背景を同じタップ領域にまとめる
- active状態は薄いミント背景と深いグリーンで示す
- 画面幅390pxで水平overflowを発生させない

## 画面方針

### Today

問題カードを最初の主役にする。

- 上部は完了数と日付だけのコンパクトなprogress rail
- 問題番号は小さな移動ボタン列として表示し、未回答・回答済み・現在位置を区別する
- 1画面に1問だけ表示する
- 選択肢、confidence、任意のreasoning、Submitの順に読む
- 回答後は「Your answer」と「Correct answer」を明確に分離する
- 翻訳はカード内の補助パネルとして表示する
- Today Assistantは常時表示できるfloating buttonから開く
- Assistantは現在の問題と会話履歴を使い、具体的な説明、ヒント、ユースケースを返す

### Dashboard

- 今日の行動を最上部に置く
- スキルの状態は大きな装飾グラフよりも、短いsummaryと差分で伝える
- 「Continue today」「Review history」など次の行動を明確にする
- 情報カードは同じ大きさに揃えず、重要度に合わせて段差をつける

### Podcast

- 音声の再生状態を最上部で明確にする
- Generate、Play、Download、Ask this episodeの順に主要操作を整理する
- Episode Coachは再生を止めずに質問できるsheetとして表示する
- 生成中、失敗、再試行、音声なし、Pro制限をそれぞれ設計する
- 最近のepisodeはタイトル、言語、長さ、状態、再生操作を一覧で比較できるようにする

### Archive

- 年、月、日の階層を視覚的に整理する
- フリーワード検索を最上部に置く
- 回答、理解度、関連Sourceを一覧から把握できるようにする
- 過去の問題を開いてもTodayの回答操作と混同しない

### Settings / Admin

- Settingsは通常ユーザーが理解しやすい項目だけを表示する
- SourcesはSettingsから自然に遷移できる管理項目とする
- Admin accessはPC幅で情報密度を上げ、role、plan、entitlement、audit metadataを比較できるようにする
- 秘密値は再表示せず、接続状態と設定の有無だけを表示する

### Login

- 入力項目を最小限にし、ログイン状態とエラーを同じ画面で理解できるようにする
- パスワードの値や認証方式の内部詳細はUIに表示しない

## 状態とアクセシビリティ

- loading、disabled、error、empty、successを各主要操作に用意する
- focus-visibleを必ず表示する
- キーボード操作とスクリーンリーダーの名前を維持する
- reduced motionではアニメーションを短縮または無効にする
- タップ領域は最低44pxを目安にする
- 回答済み状態で、ユーザーの選択と正解を色だけで区別しない

## 署名要素

Skill Compassの記憶に残る要素は「小さな学習信号」とする。
現在位置、回答済み、未回答、LLMの支援状態を、細いprogress railと短い状態ラベルで一貫して表現する。
大きなヒーローや装飾的なイラストではなく、学習の状態そのものをブランドの視覚的な特徴にする。

## 実装順

1. 共通token、typography、surface、button、bottom navigation
2. Todayのprogress rail、問題番号、問題カード、回答状態
3. Dashboardのsummaryと次の行動
4. Podcastの再生、生成、Episode Coach
5. Archive、Settings、Sources、Login
6. Admin accessのdesktop layout

各段階で390px幅のスクリーンショット、水平overflow、固定footerとの重なり、キーボードfocusを確認する。

## 公開リポジトリ境界

この設計は公開可能なUI方針だけを含む。認証情報、個人のローカル環境、Tunnel、API key、SNS運用情報、非公開のraw specは記載しない。
