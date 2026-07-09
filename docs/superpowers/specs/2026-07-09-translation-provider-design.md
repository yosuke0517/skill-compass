# LLM Translation Provider Design

## Goal

Add a Japanese translation aid for Skill Compass quiz cards without making the public repository depend on one private runtime, one vendor API, or committed credentials.

The first scope is Task 9.5: translate Today quiz card content on demand. The default reading experience stays English-first, and Japanese appears only when the user asks for it.

## User Experience

- Each Today quiz card gets a compact translation button.
- Pressing it reveals Japanese translation for the question prompt, choices, and any answer feedback already shown.
- The translated panel stays inside the card so the user can compare English and Japanese without leaving the quiz.
- English remains the canonical source text.
- Missing translation should degrade softly with a short unavailable message rather than blocking quiz answering.

## Provider Architecture

Create a replaceable translation provider boundary:

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

Initial providers:

- `claude_cli`: calls a local `claude -p` compatible command.
- `deterministic`: public-safe fallback used in tests and unsupported environments.
- `disabled`: returns an unavailable result without calling an external model.

Provider selection comes from environment variables. `.env.example` may list variable names and non-secret examples only.

## Claude CLI Provider

The `claude_cli` provider may run a local command such as:

```bash
claude -p "<prompt>"
```

The command name is configurable with `CLAUDE_CLI_COMMAND`, defaulting to `claude`. The repo must not include local credentials, shell profiles, private paths, usage logs, billing details, or implementation details from any private project.

The provider prompt should:

- translate to natural Japanese
- preserve technical terms from the glossary
- return plain text only
- avoid adding explanations

If the command fails, times out, or returns an empty string, the app records the failure and returns a soft unavailable state.

## Cache

Add a `translation_cache` table.

Fields:

- `id`: deterministic hash id
- `sourceHash`: unique hash of source text, source locale, target locale, purpose, and glossary version
- `sourceText`
- `sourceLocale`
- `targetLocale`
- `purpose`
- `translatedText`
- `provider`
- `createdAt`
- `lastUsedAt`

Cache behavior:

1. Check cache before calling a provider.
2. Return cached text when `sourceHash` matches.
3. Call provider only on cache miss.
4. Save successful translations.
5. Do not save secrets, prompts containing private context, or local command output logs.

## Glossary

Start with a public-safe project glossary for stable engineering terms.

Examples:

- `API contract` -> `API契約`
- `reverse proxy` -> `リバースプロキシ`
- `satisfies operator` -> `satisfies演算子`
- `design token` -> `デザイントークン`
- `source` -> `出典`

The glossary gets a version string. Changing the glossary version invalidates old cache keys without deleting old cache rows.

## Server Flow

1. User opens Today quiz.
2. Card renders English source content.
3. User presses translate.
4. Server action receives quiz day id, question id, and content purpose.
5. Service checks cache.
6. Service calls provider on miss.
7. Successful translation is cached.
8. Page revalidates and shows translated panel.

## Safety

- No API keys, auth tokens, private paths, private project details, raw internal specs, or local usage logs are committed.
- The CLI command is optional and configured through environment variables.
- Deployment can set `TRANSLATION_PROVIDER=disabled` or use a future API provider.
- Tests use deterministic provider behavior.
- Translation is a learning aid only; scoring and correctness remain based on original English quiz data.

## Testing

Unit tests:

- cache hit does not call provider
- cache miss calls provider and stores result
- provider failure returns unavailable state
- glossary version changes cache hash

E2E test:

- logged-in user opens Today
- clicks translate on one quiz card
- sees Japanese translation panel
- can still submit an answer

## Out Of Scope

- Full-page localization
- Browser language negotiation
- User-editable glossary UI
- Streaming translation
- API-provider billing controls
- Translating source documents
