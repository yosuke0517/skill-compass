# Today Confidence Removal Design

## Summary

Skill Compass Todayから主観的な自信度入力を完全に廃止する。新しい回答契約は、選択肢と理由だけを学習者の入力として扱う。スコアと復習間隔は、正誤、理由の質、誤解の深刻度という回答から評価可能な情報だけで決定する。

対象はWeb UI、Learning MCP、Voice/Live用SYNC PACK、回答永続化、履歴、スコアリング、Architecture MCPの公開説明、ショーケース、運用資料、テストである。既存回答の自信度データはDB migrationで削除する。

## Problem

現在の回答には1〜5の`confidence`が必須である。この値は主観的であり、次の問題を生んでいる。

- Voice/Liveで聞き漏らすと、選択肢と理由が揃っていてもSYNC PACKを送信できない。
- MCP schemaが`confidence`を必須にするため、後から推測で補うか回答全体を破棄するかの不自然な選択になる。
- 主観値がスコア増減と復習間隔を左右し、実務判断力の評価として説明しにくい。
- Web、MCP、Voice、DB、履歴の全境界へ入力項目が伝播し、利用者と実装の双方に不要な負担を増やしている。

今回発生した「自信度を記録していないため完成済み回答が0件」という失敗を解消し、選択肢と理由が揃えば同期可能にする。

## Goals

- Today回答から`confidence`を完全に削除する。
- 選択肢と理由が揃った回答を、WebとMCPの両方で送信可能にする。
- スコアと復習間隔を、正誤、理由の質、誤解の深刻度だけで計算する。
- Web、MCP、Voice/Live、履歴が同じ回答契約を使用する。
- 既存のToday、ユーザー分離、回答評価、進捗、履歴を維持する。
- 公開資料から、現在は存在しない自信度機能の記述を除去する。

## Non-goals

- 理由入力の廃止または任意化。
- LLMによる理由評価の再設計。
- Today問題、選択肢、正解、Instructor Dataの変更。
- 自己評価機能全体の廃止。
- 過去の自信度データの別テーブルへの退避。
- 新しい主観評価指標の追加。

## Chosen approach

`confidence`を非表示にするだけ、nullableで残す、固定値を保存する、という互換層は設けない。DB column、domain type、service input、MCP schema、form、history DTO、scoring inputから完全に除去する。

古いクライアントが余分な`confidence`を送信しても、現在のZod objectの既定動作に従い未知フィールドとして無視できる。一方、サーバーから`confidence`を要求・返却する契約は残さない。これにより、移行直後の古いSYNC PACKを不必要に拒否せず、新契約では自信度への依存をなくす。

## Answer contract

### Web

未回答カードは次だけを収集する。

- `quizDayId`
- `questionId`
- `selectedChoiceId`
- `reasoning`

自信度fieldsetと関連CSSを削除する。理由は引き続き必須とし、選択肢または理由が欠ける場合は送信しない。

### Learning MCP

`submit_today_answer`のinput schemaを次へ変更する。

- `quizDayId`
- `questionId`
- `selectedChoiceId`
- `reasoning`
- optional `latestUserMessage`

tool descriptionから自信度を除去する。MCP service boundaryとToday serviceも同じ入力を使用する。

### Voice/Live SYNC PACK

完成済み項目は次の4フィールドだけを持つ。

```text
- quizDayId: ...
  questionId: ...
  selectedChoiceId: ...
  reasoning: ...
```

選択肢と理由が確定した項目は同期可能であり、自信度の欠落を理由に除外しない。

## Persistence migration

新しいDrizzle migrationで`answers.confidence` columnを削除する。既存値は移行時に破棄し、退避しない。

schema、migration metadata、repository insert/update条件から`confidence`を除去する。回答のownership、question/choice検証、確定済み回答の保護、retry可能な評価処理は維持する。

本番適用順は、互換性を保つため次の順とする。

1. 新コードをbuildする。
2. DB migrationでcolumnを削除する。
3. 新コードのproduction processを再起動する。
4. WebとMCPの回答送信をsmoke testする。

現行コードはcolumnを必須参照するため、migrationだけを先行適用して旧processを長時間動かさない。

## Scoring and review schedule

`ScoreInput`は次だけを受け取る。

- `correct`
- `reasoningQuality`
- `misconceptionSeverity`

既存ルールから自信度に依存する分岐だけを削除し、残りを維持する。

### Score delta

- 正解: `+0.06`
- 不正解: `-0.04`
- 正解かつreasoningが`good`: 追加`+0.05`
- 不正解かつreasoningが`partial`: 追加`+0.03`
- `major` misconception: 追加`-0.08`
- `minor` misconception: 追加`-0.02`

### Review interval

- 不正解またはmisconceptionあり: `reviewSoon=true`、2日後
- 正解、misconceptionなし、reasoningが`good`: 14日後
- 正解、misconceptionなし、reasoningが`partial`または`poor`: 7日後

これにより、高い自信度による加点、低い自信度による減点・早期復習をなくし、観測可能な回答品質だけを使う。

## Calibration removal

自信度と正答確率の差を表す`SkillGap`、`aligned`、`underconfidence`、`overconfidence`と、その計算関数を削除する。現在の利用箇所を確認し、未使用exportだけでなくUIや公開説明に残る校正概念も除去する。

一般的な「skill gap」という語が別の実力差を意味して使われている場合は、今回のconfidence calibrationと区別し、無関係な機能を削除しない。

## Read models and history

Today DTO、Web Today DTO、履歴入力、履歴詳細、Instructor Pack内のexisting answerから`confidence`を除去する。

履歴では次を維持する。

- 選択した回答
- 正解
- 理由
- feedback
- 日付、正答数、正答率

過去回答はcolumn削除後も、自信度以外の情報をそのまま表示できる。

## Documentation

現在の契約を説明する継続管理対象を更新する。

- `docs/runbooks/chatgpt-mcp.md`
- `docs/specs/skill-compass-lite-design.md`
- `docs/showcase/skill-compass-architecture.html`
- Architecture MCPのreviewed manifest
- Today practical learningの現行仕様に、後続変更としてconfidence廃止を明記

過去の実装計画は履歴資料であるため、原則として原文を維持する。ただし、現在の手順としてコピーされる可能性が高いrunbookと現行設計・ショーケースは必ず更新する。

## Error handling

- choiceがない回答は拒否する。
- reasoningが空または空白だけの回答は拒否する。
- confidenceがないことをエラーにしない。
- 古い入力にconfidenceが含まれていても、それだけを理由に拒否しない。
- LLM reasoning評価が失敗した場合は、既存どおりretry可能な評価状態として回答を保存する。
- migration未適用などschema mismatchは通常の運用エラーとして検出し、回答成功と報告しない。

## Testing

### Unit tests

- confidenceなしでscore deltaを計算できる。
- 正解・良いreasoning・誤解なしは`+0.11`、14日後になる。
- 正解・partial reasoning・誤解なしは`+0.06`、7日後になる。
- 不正解・partial reasoning・誤解なしは`-0.01`、2日後になる。
- minor/major misconceptionの減点と2日後復習を維持する。
- confidence calibration関連testを削除する。

### Integration tests

- Web formがchoiceとreasoningだけで回答を保存できる。
- MCP `submit_today_answer`がconfidenceなしで成功する。
- choiceまたはreasoning不足は拒否される。
- 古い追加confidenceフィールドがあっても回答契約を壊さない。
- 保存済み回答、Today progress、履歴にconfidenceが存在しない。
- ユーザーownershipと重複送信保護を維持する。

### Migration and build verification

- migrationが既存回答を保持したままconfidence columnだけを削除する。
- typecheck、lint、全test、production buildを実行する。
- migration後の一時DBまたは本番相当DBでWebとMCPをsmoke testする。

### Manual Voice/Live verification

1. scheduled lesson packetを準備する。
2. Voice/Liveでchoiceとreasoningだけを回答する。
3. confidenceなしのSYNC PACKを生成する。
4. normal chatで同期文を送る。
5. `submit_today_answer`が呼ばれ、Web Todayと履歴へ同じ回答が反映されることを確認する。

## Success criteria

- Webに自信度入力が表示されない。
- MCP schemaがconfidenceを要求しない。
- Voice/Liveの完成条件がchoiceとreasoningだけになる。
- confidenceなしのSYNC PACKを正常に同期できる。
- DB schemaにconfidence columnがない。
- スコア、復習間隔、履歴、公開説明にconfidence依存が残らない。
- 既存回答のchoice、reasoning、correctness、feedback、履歴が維持される。

