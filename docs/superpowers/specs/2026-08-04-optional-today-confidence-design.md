# Optional Today Confidence Design

## Summary

Skill Compass Todayの自信度1〜5を必須入力から任意の振り返りデータへ変更する。選択肢と理由が揃えば、Web、MCP、Voice/Liveのいずれからでも回答を完了・同期できる。自信度を入力した場合だけ保存・履歴表示するが、Todayのスコアと復習間隔には使用しない。

SkillsとDashboardにある「自己評価と実測スコアのギャップ」はToday回答の自信度とは異なる機能であるため、変更せず維持する。

## Problem

現在は`confidence`がDB、Web form、domain service、MCP schema、SYNC PACKで必須である。Voice/Liveで自信度を聞かなかった場合、選択肢と理由が揃っていても「完成済み回答0件」と判定され、同期できない。

また、回答時の主観的な自信度がスコアや復習間隔を左右するため、実務判断力を正誤・理由・誤解から評価するというTodayの目的を説明しにくい。

## Goals

- 選択肢と理由だけで回答を完成・同期できる。
- 自信度は入力した場合だけ1〜5で保存する。
- 自信度未入力は`null`として扱い、固定値を捏造しない。
- Todayのスコアと復習間隔から自信度依存を除去する。
- 履歴では保存済み自信度がある場合だけ表示する。
- 既存の自信度データを保持する。
- 自己評価と実測値のギャップ機能を維持する。

## Non-goals

- 自信度カラムや既存値の削除。
- 理由入力の任意化。
- 自己評価、`calculateGap`、`SkillGap`、`underconfidence`、`overconfidence`の変更。
- LLMによるreasoning評価の再設計。
- 新しい主観指標の追加。

## Answer contract

回答の必須項目は次の4つとする。

- `quizDayId`
- `questionId`
- `selectedChoiceId`
- 非空の`reasoning`

`confidence`はoptionalな1〜5の整数である。省略時は`undefined`をserviceへ渡し、永続化境界で`null`として保存する。0、6、小数、数値でない値は、入力された場合にはvalidation errorとする。

古いクライアントが`confidence`を送る場合は引き続き受け入れる。新しいクライアントは送信しなくてよい。

## Web behavior

Today cardには自信度1〜5を任意欄として残し、legendに`Optional`を明示する。既定値は選択しない。choiceとreasoningがあればsubmitできる。

Server Actionは空のconfidenceを`undefined`として扱う。値がある場合だけ1〜5の整数か検証する。choiceまたはtrim済みreasoningが欠ける場合は従来のmissing-answer flowへ送る。

## MCP and Voice/Live

`submit_today_answer`のZod schemaは`confidence: z.number().int().min(1).max(5).optional()`とする。tool descriptionはchoiceとreasoningが完成条件であり、confidenceはoptional reflection metadataであると説明する。

SYNC PACKの必須形式は次とする。

```text
- quizDayId: ...
  questionId: ...
  selectedChoiceId: ...
  reasoning: ...
```

Voice/Liveで自信度を尋ねる必要はない。ユーザーが自発的に自信度を述べた場合だけ`confidence`行を追加できる。normal-chat syncはconfidenceがなくても送信する。

## Persistence migration

`answers.confidence`を`INT NOT NULL`から`INT NULL`へ変更する。既存値は維持する。

Drizzle schemaは`confidence: int("confidence")`とする。repository insert/update/finalizeは`number | null`を扱う。確定競合の比較ではMySQLのnull-safe equality `<=>`を使うか、入力がnullの場合に`isNull`を使い、未評価raw answerの同一性を正しく検証する。

## Scoring and review schedule

`ScoreInput`からconfidenceを除去し、次だけを使用する。

- `correct`
- `reasoningQuality`
- `misconceptionSeverity`

### Score delta

- 正解: `+0.06`
- 不正解: `-0.04`
- 正解かつreasoningが`good`: 追加`+0.05`
- 不正解かつreasoningが`partial`: 追加`+0.03`
- `major` misconception: 追加`-0.08`
- `minor` misconception: 追加`-0.02`

### Review interval

- 不正解またはmisconceptionあり: 2日後
- 正解、misconceptionなし、reasoningが`good`: 14日後
- その他の正解、misconceptionなし: 7日後

confidenceが入力されていても計算結果は変わらない。

## Self-assessment gap preservation

`src/lib/scoring/gaps.ts`、`SkillGap`、Skills/Dashboardのself-assessment比較は維持する。これはユーザーが概念・分野について行う自己評価と、蓄積された実測scoreを比較する機能であり、個々のToday回答のconfidenceとは独立している。

テストでは、Today scoring inputにconfidenceが存在しないことと、`calculateGap`の既存testが引き続き通ることを両方確認する。

## Read models and history

Today DTO、Instructor Pack existing answer、履歴詳細の`confidence`は`number | null`とする。Web履歴では値があるときだけ表示し、nullの場合は「未入力」ラベルを増やさず行自体を省略する。

## Documentation

次の現行資料をoptional契約へ更新する。

- `docs/runbooks/chatgpt-mcp.md`
- `docs/specs/skill-compass-lite-design.md`
- `docs/showcase/skill-compass-architecture.html`
- Architecture MCP reviewed manifest
- practical Todayの現行仕様と進捗記録

過去のimplementation planは履歴資料として原文を維持する。

## Testing

- confidenceなしのscore計算が新ルールになる。
- `calculateGap`とself-assessment関連testは維持される。
- Web formはchoiceとreasoningだけで成功する。
- Web formはoptional confidence 1〜5を保存できる。
- MCPはconfidenceなしで成功する。
- MCPはoptional confidenceを受け入れる。
- MCPは範囲外confidenceを拒否する。
- DB migrationは既存値を維持し、nullを許容する。
- null confidenceのraw answerを安全にfinalizeできる。
- 履歴は値がある場合だけconfidenceを表示する。
- Voice/Live SYNC PACKはconfidenceなしで同期できる。

## Success criteria

- Voice/Liveで自信度を記録しなくても、choiceとreasoningが揃った全回答を同期できる。
- Webの自信度欄はoptionalで、初期選択がない。
- DBは既存値とnullの両方を保持できる。
- Today scoreとreview intervalはconfidenceの有無・値に影響されない。
- Skills/Dashboardの自己評価と実測値のギャップ機能が変わらず動く。

