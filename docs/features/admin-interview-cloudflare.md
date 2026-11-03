# 面接サポートのCloudflare運用

画面・認証・履歴DBと、音声中継を同じSkill Compass Workerで管理する。
音声中継は `InterviewRelay` Durable Objectで実行し、OpenAIへ接続する。
Google CloudのAPIキー、サービスアカウント、Cloud Runへのデプロイは不要。
通常のAPIキーをブラウザへ渡さず、音声を保存しない。

## APIキーの設定（利用者が実施）

1. OpenAIの利用するプロジェクトでAPIキーを作成し、APIの課金設定を確認する。
2. Cloudflare Dashboard → **Workers & Pages** → **skill-compass-cloudflare-production**
   → **Settings** → **Variables and Secrets** を開く。
3. 種類 **Secret**、名前 **OPENAI_API_KEY**、値にOpenAI APIキーを設定してデプロイする。
   UIの表記が変わった場合は[公式Secret設定手順](https://developers.cloudflare.com/workers/configuration/secrets/)を参照する。
4. ステージングでも実APIを検証する場合は `skill-compass-cloudflare-staging` にも設定する。
   本番のキーをローカル開発ファイルへコピーしない。
5. 面接サポート画面で本人が「開始」し、日本語の短い質問で文字起こしとヒントを確認する。
   この操作はOpenAI API料金とアプリの利用枠を消費する。

キーはチャット、GitHubの公開変数、`NEXT_PUBLIC_*`、ソースコードに書かない。
キー未設定のデプロイは可能だが、音声処理は開始できない。
CIはOpenAIキーを上書き・削除しない。通常のWorker Secretとして維持する。

## デプロイ設定

GitHubのstaging / production Environmentの `INTERVIEW_RELAY_CONFIG`:

```json
{"transport":"cloudflare","mode":"openai","learningEnabled":true}
```

中継URLは `PUBLIC_APP_URL` と同じオリジンの `/api/interview/audio` から生成する。
外部中継URLやGoogleのaudience / subjectを指定しない。
内部のD1認可処理を直接利用し、旧中継向け公開コールバックは拒否する。
ヒントの既定モデルは `gpt-4.1-mini`、音声認識は `gpt-live-transcribe`。
ヒントモデルはWorker変数 `INTERVIEW_OPENAI_HINT_MODEL` で変更できる。

`wrangler.jsonc` にDurable ObjectのバインディングとSQLiteクラスの追加マイグレーションを含める。
音声・一時会話をDurable Objectのストレージに永続化しない。
同じリポジトリのmainコミットをステージングで検証し、成功したSHAを本番に昇格する。
Cloud Run用のイメージ更新はこの構成では行わない。

## 費用と制限

「Cloudflareなら必ず無料」ではない。2026-10-30確認のDurable Objects Free枠は
100,000リクエスト/日、13,000 GB-s/日。受信WebSocketメッセージは課金計算上20件を
1リクエストとして数える。音声が100msごとなら、1時間の音声メッセージ36,000件は
その部分だけで1,800リクエスト相当になる。接続・制御メッセージや他機能の利用は別途加わる。

OpenAIへの外向きWebSocket接続中は休止できず、稼働時間の計測対象になる。
無料枠超過時はFreeプランでは処理が失敗する。Paidプランでは契約の包含量と超過料金が適用される。
Workers、D1、既存の他機能とアカウントの利用量も確認する。移行作業で料金プランを変更しない。
OpenAIの音声認識・ヒント生成料金は、Cloudflareの無料枠とは別に発生する。

同時接続・時間・ヒント回数など既存の利用制限を維持する。
開発者モードの見積予算は請求額そのものでも、クラウド課金のハード上限でもない。
Cloud Runは切替後も自動削除しない。実音声の動作確認後、旧環境の停止・削除を別途判断する。

## QAと切り戻し

- 認証済みの管理者以外は開始できない。チケットは短寿命・一回限り。
- キー未設定、認証切れ、利用枠切れ、停止後の音声・ヒント抑止を確認する。
- 短い質問、途中の間、雑音、再接続、長時間利用、履歴保存の同意あり/なしを確認する。
- ローカルの合成応答テストと実音声・実APIの品質検証を区別する。
- Cloudflare実行環境の更新等で接続が切れる可能性があるため、再接続を確認する。
- 旧Google構成へ戻す場合は、旧Cloud Runが利用可能なことを確認してから、
  外部中継形式の `INTERVIEW_RELAY_CONFIG` を復元し、通常の本番デプロイを実行する。
  ソースの巻き戻しやD1/DOの削除は不要。履歴・利用枠を初期化しない。

参考:
- [Durable Objects料金](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [WebSocketと休止の制約](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
- [実行上限](https://developers.cloudflare.com/durable-objects/platform/limits/)

