# 面接サポートのOpenAI移行とキー設定

対象は既存の `/admin/interview`。面接画面、Workerの認証・履歴API、中継サービスを
同じSkill Compassリポジトリで管理する。リリース元は統合済みmainのコミットSHAに固定する。

## 接続構成

- ブラウザ → 既存の認証付き中継WebSocket。通常APIキーはブラウザへ渡さない。
- 中継 → OpenAI Realtime transcription (`gpt-live-transcribe`)。
- 中継 → OpenAI Responses (`gpt-4.1-mini`、`INTERVIEW_OPENAI_HINT_MODEL`で変更可能)。
- 中継 → Cloudflare Workerの認可・履歴API。この区間のGoogleサービスアカウント認証は維持する。

音声は既存の16 kHz PCMから中継で24 kHzへ変換する。ライブ文字起こしは
サーバーVAD非対応のため、中継で音量を検出し、600 msの無音または15秒で
区切ってcommitする。200 msの先行音声を保持する。4分ごとの接続更新は維持。
静かな声・環境雑音・質問途中の間に対する品質は、利用前に実音声で確認する。
音声をファイルへ保存しない。ヒントは2〜3行、各60文字以内。Responsesには
`store: false`を指定するが、API事業者の保持方針とは別である。

## あなたが行うAPIキー設定

1. [OpenAI APIのキー管理](https://platform.openai.com/api-keys)で、利用したい
   organization / projectを選び、APIキーを作成する。課金・クレジットと、
   Realtime transcription / Responsesのモデル利用権を確認する。
2. Google Cloud Consoleで、既存の面接音声中継のCloud Runサービスを開く。
   URLはWorkerの `INTERVIEW_RELAY_URL` に設定されているサービスと照合する。
   Cloudflare Worker側やフロントエンドの公開変数にはキーを置かない。
3. Secret Managerに `interview-openai-api-key` などの名前でSecretを作り、
   値としてAPIキーを入力する。キーをチャット、Git、コマンド引数へ貼らない。
4. 中継の既存ランタイムサービスアカウントに、このSecretに限定した
   Secret Accessor権限を付ける。プロジェクト全体の権限を広げる必要はない。
5. 新しい中継リビジョンの「変数とシークレット」で、Secretの特定バージョンを
   環境変数 `OPENAI_API_KEY` に割り当てる。これはキーを設定する本人が行う。

キー設定だけではソース変更は反映されない。以下のリリース作業も必要。

## リリース時に設定する項目

中継サービス:

```dotenv
INTERVIEW_RELAY_MODE=openai
INTERVIEW_OPENAI_ENABLED=1
INTERVIEW_OPENAI_HINT_MODEL=gpt-4.1-mini
# OPENAI_API_KEY はSecret参照から注入する。値を書かない。
```

既存の `INTERVIEW_RELAY_AUDIENCE`、`INTERVIEW_BROWSER_ORIGIN`、サービスアカウント、
タイムアウト3600秒、インスタンス制限は維持する。Google STT / Vertexの設定を
OpenAIモードでは利用しない。旧モードへ戻す必要がある間は認証や既存権限を削除しない。

Worker:

```dotenv
INTERVIEW_RELAY_MODE=openai
```

既存のURL、audience、subject、履歴保存フラグを維持する。Workerに
`OPENAI_API_KEY` は不要。新しいWorkerはOpenAI形式の履歴も受け付ける。
DBの追加マイグレーションは不要。元実装の既存マイグレーション適用済み環境を前提とする。

GitHubの各Environment変数 `INTERVIEW_RELAY_CONFIG` に、次の形で秘密を含まない
設定を保存する。productionでは必須。キーはこのJSONに含めない。

```json
{"mode":"openai","url":"wss://YOUR-RELAY/audio","audience":"https://YOUR-APP/api/interview/relay/redeem","subject":"NUMERIC_RUNTIME_SUBJECT","learningEnabled":true}
```

CIはこのJSONを検証しWorker変数へ反映する。初回の正式統合は `mode: google` で
現在の動作を保ち、OpenAIキーと新中継の準備後に両方を切り替えられる。
デプロイワークフローは0002〜0005のスキーマを検査し、未適用分だけ適用する。
手動適用済みDBも扱える。部分適用を検知した場合は停止し、利用枠の作成・補充はしない。

中継は同じSHAをcheckoutして `services/interview-relay` のDockerfileをビルドし、
`--build-arg RELEASE_SHA=<40桁SHA>` を指定する。既存Cloud Runサービスのイメージを
更新した後、`/health` の `release` と `mode` を照合する。Worker側のCI成功だけで
中継も更新されたとは扱わない。Cloud Runのイメージ更新は既存の認証済み運用経路から行う。

1. ローカルテストを完了する。
2. Workerのコードを更新するが、最初は `INTERVIEW_RELAY_MODE=google` のままにする。
3. 新中継リビジョンにSecretとOpenAI設定を配置し、既存セッション終了後に切り替える。
4. Workerのモードを `openai` に切り替える。途中のモード不一致は認証で拒否される。
5. `/admin/interview` に「OpenAI音声認識・ヒント生成」と出ることを確認する。
6. 本人が開始し、日本語の短い質問で文字起こし→ヒント、停止、再接続、履歴の
   opt-in時の保存を確認する。APIコストと既存利用枠を消費する。自動補充しない。
7. 問題があれば中継とWorkerの両方を `google` へ戻す。既存履歴は削除しない。

新規のAPI価格で既存の開発者用見積予算が正確になるとは限らない。
セッション時間・ヒント回数の制限は維持されるが、金銭的なハード上限ではない。
本番切替前にOpenAI側の使用量設定と見積係数を確認する。

## 開発・検証

通常のローカル結合テストは従来のmock設定で行い、キーを必要としない。
OpenAIモードはHTTPSのWorker認可と既存クラウド実行IDを必要とするため、
キーを置いただけでローカルmockを実API接続へ変更しない。

```sh
# アプリ
npm run typecheck
npm test
# 中継
cd services/interview-relay
npm ci
npm run typecheck
npm test
```

本変更のテストは合成音声・合成API応答を使用する。実キーの有効性、
実音声の認識精度・遅延、60分の稼働品質は別途確認が必要。

公式資料（2026-10-30確認）:
- [Realtime transcription](https://developers.openai.com/api/docs/guides/realtime-transcription)
- [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini)
