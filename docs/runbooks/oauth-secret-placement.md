# OAuth再暗号化とセッション鍵の配置

対象は GitHub の `yosuke0517/skill-compass` の Environment `production` と、同環境の Worker。鍵ごとに配置する。OAuth専用鍵は生成の承認後に保管し、セッション鍵の段階では1Passwordに登録済みの値を使う。DB接続情報は対象外。

1. merge の承認を受けて staging の検証結果とSHAを記録する。本番では古いrefからのデプロイをEnvironmentで制限し、workflowのrefと入力SHAの両方を確認する。通常デプロイをfreezeし、競合するrun・upload・他の書込み元を確認する。
2. 本番停止の承認後、drain版を100%配信する。新規HTTPの503とcronの通常書込み停止を確認し、旧HTTP・WebSocket等からの書込みが終了した根拠を記録する。300秒の経過だけではapplyを開始しない。
3. 明示的に許可した非秘密varsとbinding名をライブで照合する。配置直前に、本番の100%配信version、最新upload、作業で承認した基点versionの**完全なID**がすべて一致することを確認する。`versions secret put` は最新uploadを元にする。配置後にも新しいuploadと配信割合を別々に確認する。
4. 下の例は承認後に操作者の端末で実行する。生成済みの本番用Wrangler設定と、1Password CLIの認証が必要。変数には項目参照・鍵名・照合済みIDだけを入れる。シェルトレースを無効にし、秘密値はパイプだけで渡す。ツールは値の再エンコードや鍵の生成を行わず、末尾改行など両CLIで異なる扱いになる入力を拒否する。

```sh
set +x
set -o pipefail
op read --no-newline "$SECRET_REFERENCE" |
  PLACEMENT_ACK=reviewed-freeze pnpm exec tsx scripts/oauth/place-generated-secret.ts \
    "$SECRET_NAME" "$DEPLOYED_ID" "$LATEST_UPLOAD_ID" "$EXPECTED_BASE_ID"
```

5. 最初に `OAUTH_TOKEN_ENCRYPTION_SECRET` を配置する。GitHub Environmentへ書いた後、Workerには新しい**未配信version**を作成する。`secret_placed` の後も、稼働中versionが想定どおりであること、最新uploadに対象のsecret binding名が存在することを実際に確認する。専用鍵を含む通常稼働版を旧暗号文のDBへ先に配信すると、既存のトークンを読めなくなる。
6. `github_failed`、`worker_failed_after_github`、端末切断の際はfreezeを維持する。両サービスで更新時刻・version・binding名を調べる。新uploadがあれば基点の再承認まで止める。uploadが作られておらず基点が一致した場合だけ、同じ保管値を再配置する。メタデータだけで値の一致を推定しない。
7. 各dispatchの承認を受け、planの件数を確認する。apply直前のD1 Time Travel bookmarkと、旧暗号文を扱えるWorker versionを組で記録する。apply後は件数とbooleanを確認する。復旧でTime Travelを使うとDB全体が戻るため、他機能の書込みへの影響を確認する。
8. OAuth接続の復帰確認後、別の承認段階で `SESSION_SECRET` を同じ手順で配置する。`SESSION_SECRET_WRITE` はversioned配置と昇格の経路では未設定のままにする。`release` は通常workflowがセッション鍵を即時putする別経路。新versionの配信後、再ログインと既存OAuth接続の動作を確認してからfreezeを解除する。

X・Gemini・通知用の既存更新経路は `AUXILIARY_SECRET_WRITE=release` で実行される。OAuth・セッション鍵の作業中はこの変数も未設定にしておく。

[1Password CLIのread](https://www.1password.dev/cli/reference/commands/read)・[D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
