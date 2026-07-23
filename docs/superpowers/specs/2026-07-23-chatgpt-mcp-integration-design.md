# Skill Compass ChatGPT MCP Integration Design

Date: 2026-07-23

Status: Approved design

## Objective

Expose Skill Compass Today and Podcast learning workflows to ChatGPT through a private MCP server. A user should be able to say “skill-compassのTodayやりたい” in ChatGPT, answer the quiz conversationally, and have the same answers, evaluations, progress, and Podcast context persisted in the existing Skill Compass database.

The integration should support scheduled preparation at 07:00 Asia/Tokyo, default to English, and respond in Japanese when the user speaks Japanese.

## Scope

The first release includes:

- Reading the current Today quiz and progress.
- Presenting one unanswered Today question at a time.
- Submitting the selected choice, confidence, and reasoning.
- Persisting evaluation and score changes through the existing quiz domain.
- Listing Podcast episodes available to the authenticated user.
- Reading an episode’s title, transcript, sources, and status.
- Asking grounded questions about an episode and persisting the conversation.
- Making these operations available as MCP tools to ChatGPT.
- Preparing Today and checking Podcast generation status every day at 07:00 Asia/Tokyo.

The first release does not include:

- Migrating MySQL to Cloudflare D1.
- Migrating the Podcast worker to Cloudflare Workflows.
- Replacing Gemini or the existing R2 audio storage.
- Exposing the database, internal ports, correct-answer flags, secrets, or raw provider credentials.
- Anonymous public access.
- Submitting quiz answers automatically from the scheduled task.

## Recommended Deployment

Keep the existing runtime for the first release:

```text
ChatGPT
  -> Skill Compass app connection
  -> MCP over HTTPS
  -> agent.finegate.xyz/mcp
  -> Cloudflare Tunnel
  -> localhost:3001
  -> Next.js production server
  -> shared Skill Compass services
  -> MySQL / Gemini / R2
```

The Mac must keep the Next.js production server and `cloudflared` running. The Podcast worker runs separately using the existing queue and worker CLI.

This approach preserves the working Next.js, MySQL, Keychain, Gemini, and R2 architecture. A later migration may move the application to OpenNext, D1, Cloudflare Secrets, and Workflows after the MCP workflow is validated.

## Architecture

### Shared service boundary

Web routes and MCP tools must call shared application services rather than calling each other over HTTP:

```text
Web UI/API ----\
                -> Today service ------> MySQL
MCP tools -----/

Web UI/API ----\
                -> Podcast service ----> MySQL / Gemini / R2
MCP tools -----/
```

The shared service layer owns authorization, validation, persistence, and domain behavior. This prevents the ChatGPT integration from developing a second scoring or Podcast-answering implementation.

### MCP endpoint

Expose a streamable HTTP MCP endpoint at:

```text
https://agent.finegate.xyz/mcp
```

The endpoint publishes five tools:

#### `get_today`

Returns the authenticated user’s local Today quiz date, progress, and the next unanswered question.

The result includes:

- Quiz day ID.
- Question ID and slot.
- Prompt.
- Choice IDs and labels.
- Selection reason where appropriate.
- Answered and total counts.
- Whether the day is complete.

The result must not include choice correctness, rationale, hidden feedback, or answers to unanswered questions.

#### `submit_today_answer`

Accepts:

- Quiz day ID.
- Question ID.
- Selected choice ID.
- Confidence score.
- Reasoning text.

It calls the existing quiz submission and evaluation behavior, persists the result, updates scores, and returns concise feedback plus updated progress. Repeated submission uses the existing deterministic answer identity and must not create duplicate answers.

#### `list_podcast_episodes`

Returns a bounded list of episodes owned by the authenticated user. Each item contains its ID, title, local date, language, status, duration when available, and whether transcript/source context is ready.

#### `get_podcast_episode`

Returns the selected owned episode’s title, language, transcript, source titles and URLs, and status. Audio binary data and storage credentials are excluded.

#### `ask_about_podcast`

Accepts an owned episode ID and a question. It uses the existing episode transcript, sources, and recent conversation context, then persists both the user and assistant messages through the existing Podcast chat domain.

### Conversation behavior

ChatGPT decides when to invoke tools based on the user’s request.

For Today:

1. Invoke `get_today`.
2. Present only the next unanswered question.
3. Ask for missing choice, confidence, or reasoning conversationally.
4. Invoke `submit_today_answer` only after all required values are known.
5. Explain the returned evaluation.
6. Continue with `get_today` when the user wants the next question.

For Podcast:

1. Use `list_podcast_episodes` when the episode is unspecified.
2. Resolve the requested episode.
3. Use `get_podcast_episode` for direct inspection or `ask_about_podcast` for a persisted grounded answer.
4. Clearly distinguish episode/source-grounded statements from general explanation.

### Language behavior

Language is selected from the user’s latest substantive message:

- Japanese input produces Japanese questions, prompts, and explanations.
- Other input produces English output.
- English is the default when language cannot be determined.

Stored quiz and Podcast source content may remain in its original language. Translation is performed only for presentation and must not change IDs, answer choices, scoring, or stored source content.

## Authentication and Authorization

The MCP endpoint must not reuse or expose a browser session cookie to ChatGPT.

Use a dedicated, revocable ChatGPT connection credential. The initial implementation may use a single-user bearer token if ChatGPT’s connection surface supports secure secret entry. OAuth 2.1 with PKCE is the target design when an interactive app authorization flow is required.

Every tool resolves exactly one active Skill Compass user and enforces ownership:

- Today data belongs to the authenticated user context.
- Podcast episode and chat access requires ownership.
- Podcast tools require the existing Pro entitlements, including `podcast.chat` where applicable.
- Tokens are stored as hashes or encrypted secrets and can be revoked.
- Tool inputs never accept an arbitrary user ID.

Cloudflare Tunnel publishes only the HTTPS application hostname. MySQL, R2 credentials, Keychain secrets, localhost ports, and internal worker interfaces remain private.

Cloudflare Access may protect human-facing routes, but it must not block the authenticated MCP client flow. The MCP endpoint uses its own application-level authorization.

## Scheduled Task

Create one ChatGPT scheduled task for 07:00 Asia/Tokyo after the MCP app connection is installed.

The task:

1. Calls `get_today` so the day’s quiz is prepared by the existing lazy preparation behavior.
2. Calls `list_podcast_episodes` to inspect the latest generation status.
3. Reports Today progress and whether a new Podcast is ready, queued, processing, failed, or absent.
4. Does not reveal Today answers or submit on the user’s behalf.
5. Invites the user to say “skill-compassのTodayやりたい” to begin.

Scheduled output follows the same language rule. The task runs in English by default and responds in Japanese when the user continues in Japanese.

## Failure Handling

- If the Next.js origin or Tunnel is unavailable, MCP tools return a concise unavailable result without fabricating quiz or Podcast state.
- If Today contains no prepared questions, `get_today` reports that no question is available.
- Invalid or stale question and choice IDs are rejected without updating scores.
- If evaluation fails after raw answer persistence, preserve the existing retryable answer behavior.
- Missing or unauthorized Podcast episodes return a non-revealing not-found response.
- If Podcast chat generation fails, do not persist an assistant message that was never generated.
- Scheduled runs report failures and leave the task available for a later run.
- Logs include request IDs, tool names, status, and latency, but exclude tokens, full transcripts, private calendar data, and reasoning text.

## Testing

### Unit tests

- MCP tool schemas accept valid inputs and reject malformed inputs.
- `get_today` never returns correctness metadata for unanswered questions.
- Language selection chooses Japanese for Japanese input and English otherwise.
- Authentication maps credentials to one active user.
- Podcast ownership and Pro entitlements are enforced.

### Integration tests

- The MCP Today flow reads the same prepared quiz as the web UI.
- Submitting through MCP creates or updates the same answer row and score changes as the web flow.
- A completed Today returns completion without another question.
- Podcast tools read the same episode and source snapshot as the Podcast page.
- Podcast questions persist to the existing chat history.
- Revoked or invalid credentials cannot access any tool.

### End-to-end verification

- Start the production Next.js server on port 3001.
- Start the configured Cloudflare Tunnel.
- Verify the MCP endpoint through `agent.finegate.xyz`.
- Connect it to ChatGPT.
- Complete one Today question from ChatGPT and confirm it appears answered in the web UI.
- Ask about one Podcast episode in ChatGPT and confirm the persisted chat appears in Skill Compass.
- Run the 07:00 task once manually before enabling its recurring schedule.

## Rollout

1. Refactor Today and Podcast operations into shared application services without changing web behavior.
2. Add authenticated MCP tools and local integration tests.
3. Run Next.js production on port 3001 and restore the existing Cloudflare Tunnel.
4. Verify the endpoint privately before connecting ChatGPT.
5. Install the Skill Compass app connection in ChatGPT.
6. Verify conversational Today and Podcast synchronization.
7. Create the 07:00 Asia/Tokyo scheduled task.
8. Add process supervision for Next.js, `cloudflared`, and the Podcast worker.

## Cost Boundary

The first release adds no required Cloudflare compute or database migration. Cloudflare Tunnel is used with the existing local origin, while the existing R2, Gemini, X API, and ChatGPT plan limits continue to determine variable costs.

X API usage remains independent from MCP hosting. Public Post reads are cached and budget-limited through the existing Podcast collection boundaries. The integration must not poll X merely to keep the MCP connection alive.

## Future Cloudflare-Native Migration

Consider OpenNext on Workers, D1, Cloudflare Secrets, and Workflows only after:

- The MCP tool contracts are stable.
- Local-host uptime is an actual constraint.
- MySQL compatibility work is estimated.
- Podcast generation is redesigned for Cloudflare execution limits.
- Keychain secrets have a Cloudflare Secrets migration path.
- A backup and restore plan exists for D1 and R2.
