# GitHub Stacked Pull Requests 解説

## ひとことで言うと

Stacked Pull Requests（Stacked PR）は、大きな変更をレビュー可能な小さなPRへ分割し、依存順に積み上げて扱う開発方法です。

```text
main
  └─ PR 1: DBマイグレーション
       └─ PR 2: Repositoryとテスト
            └─ PR 3: APIとテスト
```

各PRは、常に `main` との差分を見せるのではなく、直下のPRとの差分だけを見せます。そのため、変更全体は大きくても、レビュー担当者は一度に一つの論点へ集中できます。

## 話題になったXポストの意味

[鹿野 壮さんのXポスト](https://x.com/tonkotsuboy_com/status/2083007010933756349)は、GitHubにStacked PRの公式機能が登場したことを歓迎する内容です。

「前のブランチに対して数珠つなぎのようにPRを作る」とは、次のような運用を指します。

- `feature/db` を `main` から作る
- `feature/repository` を `feature/db` から作る
- `feature/api` を `feature/repository` から作る
- それぞれを別のPRとしてレビューする

従来もGitのブランチを使えば実現できましたが、下位ブランチの更新に伴うrebase、push、PRのbase変更、依存関係の説明などを手作業で管理する必要がありました。GitHubのStacked PRと公式の `gh stack` 拡張は、この運用を一つのまとまりとして扱いやすくします。

## なぜ今、重要なのか

AIエージェントは実装速度を大きく高めますが、人間のレビュー速度が同じ割合で上がるとは限りません。巨大なPRを一度に渡すと、次の問題が起きます。

- 変更の目的が複数混ざり、レビュー観点が散る
- 差分が大きすぎて、重要な不具合を見落としやすい
- 一部だけ先にマージしたくても切り離せない
- 修正が入るたび、変更全体を読み直す負担が生じる

Stacked PRでは、AIエージェントに大きな機能を一括実装させた場合でも、DB、ドメイン、API、UIなどの意味のある単位へ分けてレビューできます。実装速度ではなく、レビュー可能性を保つための仕組みと考えると分かりやすいです。

## 通常の複数PRとの違い

独立した複数PRは、原則としてすべて `main` をbaseにします。一方、Stacked PRでは、上のPRが下のPRを前提にします。

```text
独立したPR
main ─┬─ PR A
      ├─ PR B
      └─ PR C

Stacked PR
main ── PR 1 ── PR 2 ── PR 3
```

Stacked PRが向いているのは、一つの機能を小さく分けたいものの、後半の変更が前半の変更へ技術的に依存している場合です。互いに依存しない変更なら、通常の独立したPRの方が単純です。

なお、ここでいうstackは「技術スタック」や「LIFOのデータ構造としてのスタック」ではありません。依存するPRを順番に積み上げた集合を指します。

## 実務例

たとえば、注文検索APIへ新しい絞り込み条件を追加するとします。

### PR 1: DB変更

- カラムやインデックスを追加する
- マイグレーションを追加する
- DB単体で成立する検証を入れる

### PR 2: データアクセス層

- PR 1のスキーマを利用するRepositoryを追加する
- SQLとRepositoryのテストを追加する

### PR 3: API

- PR 2のRepositoryを利用するendpointを追加する
- request、response、errorの契約とテストを追加する

レビュー担当者は、PR 2でDBマイグレーションの差分を再度読む必要がありません。PR 2固有のRepository実装だけを確認できます。

## 基本的な操作

公式拡張は次のコマンドで導入します。

```bash
gh extension install github/gh-stack
```

代表的な流れは次のとおりです。

```bash
# リポジトリでstackを使う準備
gh stack init

# 現在の変更を新しいlayerとして追加
gh stack add

# stackのPRを作成・更新
gh stack submit

# stack全体を確認
gh stack view

# mainの更新を取り込み、下から順にrebaseして同期
gh stack sync
```

移動や更新に使う主なコマンドもあります。

- `gh stack up` / `gh stack down`: 隣接するlayerへ移動する
- `gh stack top` / `gh stack bottom`: stackの先頭・末尾へ移動する
- `gh stack push`: stack内のbranchをまとめてpushする
- `gh stack sync --prune`: 同期に加え、不要になったbranchを整理する

`gh stack sync` の価値は、`main` の取得、下位layerから上位layerへの連鎖的なrebase、push、PRメタデータの同期をまとめて扱える点にあります。

## レビュー・CI・マージ

各layerは独立したPRとしてレビューできますが、依存関係は維持されます。

- required review、status check、CODEOWNERS、code scanningなど既存の保護は引き続き適用される
- CIは、各PRが最終的にtrunkへ入ることを前提とした差分として評価される
- stack全体または一部を、依存順を守ってマージできる
- 下位layerの変更後は、上位layerをrebaseして線形な履歴へ戻す必要がある
- 下位PRのマージ後、上位PRのbaseは適切な対象へ更新される

GitHubの説明では、merge commit、squash merge、rebase mergeを利用できます。ただし、リポジトリのbranch protectionやmerge policyとの組み合わせは事前に確認するべきです。

## AIエージェントと使う場合

GitHubは `gh stack` を扱うためのagent skillも案内しています。

```bash
gh skill install github/gh-stack
```

これにより、対応するAI coding agentへStacked PRの操作方法を与えられます。ただし、skillを入れれば分割設計まで自動的に正しくなるわけではありません。人間またはエージェントへの指示には、次を明示する必要があります。

- 各PRの責務
- PR間の依存関係
- 各layerが単独でテスト可能か
- どこまでなら安全に先行マージできるか
- migrationとアプリケーションコードの互換性

## 良い分割と悪い分割

### 良い分割

- 各PRの目的を一文で説明できる
- 各PRに対応するテストがある
- 下位PRから順に見れば設計意図を追える
- 可能なら各layerがビルド・テストに成功する
- レビュー観点がDB、API、UIなど明確に分かれる

### 悪い分割

- ファイル数だけを均等にしている
- 上位PRを読まないと下位PRの意図が分からない
- 中間layerが常にビルド不能である
- 相互依存が多く、どちらが先か決められない
- 小さくしすぎて、レビュー時の文脈切り替えが増える

重要なのは「小さいPR」そのものではなく、「一つの判断としてレビューできるPR」にすることです。

## 注意点とトレードオフ

- 同じリポジトリ内のbranchを前提とし、forkをまたぐstackには制約がある
- GitHub DesktopではStacked PR専用操作がサポートされていない
- 下位layerの変更が上位すべてへ伝播するため、stackが長すぎるとrebase競合が増える
- CIがlayerごとに走るため、実行時間や利用料金が増える場合がある
- レビュー担当者がstackの順番を理解していないと、上位PRを先に見て混乱する
- Public Preview中の機能は、仕様や対応範囲が変わる可能性がある

目安として、互いに強く依存する変更が何十layerにもなるなら、単なる分割不足ではなく設計自体が複雑すぎないかを見直すべきです。

## 理解確認に使える質問

音声会話で理解を深める場合は、次の順に考えるとよいです。

1. Stacked PRは、通常の複数PRと何が違うか。
2. なぜPR 3は `main` ではなくPR 2のbranchをbaseにするのか。
3. 下位PRを修正したとき、上位PRへ何が起きるか。
4. `gh stack sync` は、どの手作業をまとめてくれるか。
5. 既存のCIやbranch protectionは無効になるのか。
6. 独立したPRの方が適切なのはどのような変更か。
7. AIエージェントが生成した巨大な変更を、どういう基準で分割するか。
8. stackが長すぎると、どのようなコストが生じるか。
9. 自分の現在の開発フローへ入れるなら、最初にどの機能で試すか。

## 覚え方

> Stacked PRは、依存する大きな変更を「一つずつ判断できる小さなPR」に分け、順序を保ったままレビュー・同期・マージする仕組み。

## 参考資料

- [GitHub Changelog: Stacked pull requests are now in public preview](https://github.blog/changelog/2026-07-30-stacked-pull-requests-are-now-in-public-preview/)
- [GitHub Docs: Stacked pull requests](https://docs.github.com/en/pull-requests/reference/stacked-pull-requests)
- [GitHub Docs: Creating stacked pull requests](https://docs.github.com/en/pull-requests/how-tos/create-pull-requests/creating-stacked-pull-requests)
- [Ubie Tech Blog: GitHubにスタックプルリクエストが登場。gh stackでPRを分割して積み上げよう](https://zenn.dev/ubie_dev/articles/gh-stack-introduction)
- [話題のきっかけになったXポスト](https://x.com/tonkotsuboy_com/status/2083007010933756349)
