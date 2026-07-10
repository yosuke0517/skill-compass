# LLM翻訳Provider設計

## 目的

public repositoryを特定のprivate runtime、vendor API、commit済み認証情報へ依存させず、Skill Compassのquiz cardへ日本語翻訳支援を追加する。

最初のscopeはTask 9.5とし、Today quiz cardの内容を必要に応じて翻訳する。標準の読解体験は英語優先のままとし、ユーザーが要求した場合だけ日本語を表示する。

## ユーザー体験

- Todayの各quiz cardへcompactな翻訳buttonを配置する。
- buttonを押すと、question prompt、choice、表示済みanswer feedbackの日本語訳を表示する。
- 翻訳panelはcard内に置き、quizから離れず英語と日本語を比較できるようにする。
- 英語をcanonical source textとする。
- 翻訳を取得できない場合もquiz回答を妨げず、短いunavailable messageへfallbackする。

## Provider Architecture

差し替え可能な翻訳Provider境界を作る。

```ts
export type TranslationInput = {
  sourceText: string;
  sourceLocale: "en";
  targetLocale: "ja";
  purpose: "quiz_prompt" | "quiz_choice" | "quiz_feedback";
  glossary: TranslationGlossaryEntry[];
};

export type TranslationResult = {
  translatedText: string;
  provider: string;
};

export interface TranslationProvider {
  translate(input: TranslationInput): Promise<TranslationResult>;
}
```

初期Provider:

- `claude_cli`: localの`claude -p`互換commandを呼び出す。
- `deterministic`: testと未対応環境で使う公開可能なfallback。
- `disabled`: 外部modelを呼ばず、利用不可の結果を返す。

Provider選択には環境変数を使う。`.env.example`には変数名と秘密でない例だけを記載する。

## Claude CLI Provider

`claude_cli` Providerは、以下のようなlocal commandを実行できる。

```bash
claude -p "<prompt>"
```

command名は`CLAUDE_CLI_COMMAND`で変更可能とし、defaultは`claude`とする。repositoryにはlocal認証情報、shell profile、private path、利用log、billing detail、private projectの実装詳細を含めない。

Provider promptには以下を要求する。

- 自然な日本語へ翻訳する。
- glossaryの技術用語を維持する。
- plain textだけを返す。
- 説明を追加しない。

commandの失敗、timeout、空文字列の場合、failureを記録してsoft unavailable stateを返す。

## Cache

`translation_cache` tableを追加する。

field:

- `id`: 決定論的なhash ID
- `sourceHash`: source text、source locale、target locale、purpose、glossary versionの一意hash
- `sourceText`
- `sourceLocale`
- `targetLocale`
- `purpose`
- `translatedText`
- `provider`
- `createdAt`
- `lastUsedAt`

cache behavior:

1. Provider呼び出し前にcacheを確認する。
2. `sourceHash`が一致した場合、cache済みtextを返す。
3. cache missの場合だけProviderを呼ぶ。
4. 成功した翻訳を保存する。
5. Secret、private contextを含むprompt、local command output logは保存しない。

## Glossary

安定したengineering termを対象に、公開可能なproject glossaryから始める。

例:

- `API contract` -> `API契約`
- `reverse proxy` -> `リバースプロキシ`
- `satisfies operator` -> `satisfies演算子`
- `design token` -> `デザイントークン`
- `source` -> `出典`

glossaryにはversion stringを設定する。versionを変更すると、既存cache rowを削除せずに古いcache keyを無効化できる。

## Server Flow

1. ユーザーがToday quizを開く。
2. cardが英語のsource contentを表示する。
3. ユーザーが翻訳buttonを押す。
4. server actionがquiz day ID、question ID、content purposeを受け取る。
5. serviceがcacheを確認する。
6. cache missの場合はProviderを呼ぶ。
7. 成功した翻訳をcacheへ保存する。
8. pageをrevalidateし、翻訳panelを表示する。

## Safety

- API key、auth token、private path、private project detail、raw internal spec、local usage logをcommitしない。
- CLI commandは任意機能とし、環境変数で設定する。
- deploymentでは`TRANSLATION_PROVIDER=disabled`または将来のAPI Providerを指定できる。
- testではdeterministic Providerを使用する。
- 翻訳は学習支援に限定し、scoringとcorrectnessは英語のquiz dataを基準にする。

## Testing

Unit test:

- cache hitではProviderを呼ばない。
- cache missではProviderを呼び、結果を保存する。
- Provider failureはunavailable stateを返す。
- glossary version変更でcache hashが変わる。

E2E test:

- login済みuserがTodayを開く。
- 1つのquiz cardで翻訳を押す。
- 日本語translation panelが表示される。
- そのままanswerをsubmitできる。

## 対象外

- page全体のlocalization
- browser language negotiation
- user編集可能なglossary UI
- streaming translation
- API Providerのbilling control
- Source documentの翻訳
