# Database User Authentication設計

## 目的

MVPの固定password loginを、public repositoryへ安全に掲載でき、将来の招待制登録へ拡張できるdatabase-backed user authenticationへ置き換える。

## 決定事項

- userは環境変数ではなくMySQLへ保存する。
- 暗号化passwordやplaintext passwordではなくpassword hashを保存する。
- Lite MVPではnative password-hashing dependencyを増やさず、Node.js `crypto`のsalt付き`scrypt` hashを使用する。
- 既存の署名付き24時間session cookieを維持し、将来のuser-aware機能に備えてuser identity claimを含める。
- 招待受諾UI/APIは後続Taskとし、invite対応のdatabase tableだけを先に追加する。

## Data Model

- `users`
  - `id`
  - `email`
  - `display_name`
  - `password_hash`
  - `status`
  - timestamp
- `invites`
  - `id`
  - `email`
  - `token_hash`
  - `invited_by_user_id`
  - `expires_at`
  - `used_at`
  - timestamp

## Login Flow

1. login formが`email`と`password`をsubmitする。
2. serverがemailをnormalizeし、databaseからactive userを取得する。
3. 入力されたpasswordを`users.password_hash`に対してverifyする。
4. 成功時は既存の署名付き24時間session cookieを設定する。
5. 失敗時はemailの存在を推測できないgeneric errorを表示する。

## public repositoryの安全性

repositoryにはschema、hashing code、test、公開可能なlocal seed accountを含められる。実password、private user email、invite token、API key、運用domain、local machine固有情報は含めない。

## 後続Task

- invite作成と受諾flow
- password resetまたはrotation flow
- quiz progressとsettingsのuser-aware ownership
