# Skill Compass Architecture MCP Design

Date: 2026-07-24

Status: Approved design

## Objective

Add a private, read-only MCP surface that helps the Skill Compass owner explain the product in technical interviews. From the same ChatGPT conversation used for the scheduled Skill Compass learning task, the user should be able to ask about the system architecture, data flows, security controls, privacy boundaries, implementation tradeoffs, and credible future improvements.

Answers must distinguish verified current implementation from proposed improvements. The MCP must not inspect the live repository, filesystem, database, environment variables, Keychain, logs, provider credentials, or user records.

## Scope

The first release includes:

- A separate Architecture MCP endpoint and ChatGPT app connection.
- A reviewed, version-controlled, public-safe technical manifest.
- An overview of the current Skill Compass architecture and major components.
- Explanations of authentication, authorization, secret handling, PII boundaries, MCP exposure, and relevant residual risks.
- Technical-interview answers at concise, standard, and deep-dive lengths.
- Explicit separation of current implementation, tradeoffs, and future improvements.
- English output by default and Japanese output when the latest user message is Japanese.
- Access from the existing scheduled-task conversation after the Architecture app is connected.

The first release does not include:

- Reading source files at request time.
- Reading `.env` files, process environment values, Keychain entries, logs, or deployment configuration at request time.
- Querying MySQL, R2, Gemini, X, Podcast content, Today content, or user profiles.
- Returning production hostnames, local absolute paths, account email addresses, user IDs, tokens, credentials, or personal content.
- Automatically claiming that a future improvement is already implemented.
- Mutating application state.

## Recommended Architecture

Expose a second MCP resource from the existing Next.js production server:

```text
ChatGPT conversation
  -> Skill Compass Architecture app connection
  -> Architecture MCP over HTTPS
  -> Cloudflare Tunnel
  -> Next.js production server
  -> Architecture MCP server
  -> reviewed public-safe manifest
```

This surface is intentionally separate from the learning MCP:

```text
Learning MCP
  -> authenticated user context
  -> Today / Podcast services
  -> MySQL / Gemini / R2

Architecture MCP
  -> authenticated connection
  -> read-only architecture tools
  -> static public-safe manifest only
```

The Architecture MCP may reuse the existing OAuth issuer and token validation implementation. It must use its own protected-resource endpoint and MCP server factory. Its request path must not construct Today or Podcast services and must not import a database client.

## Public-Safe Manifest

The manifest is the sole knowledge source available to Architecture MCP tools. It is checked into the repository as application data and contains only reviewed statements suitable for disclosure in an interview.

The manifest contains:

- Product purpose and user-facing capabilities.
- Current runtime and deployment topology expressed without production hostnames or absolute local paths.
- Major components and their responsibilities.
- Important request and data flows.
- Authentication and authorization boundaries.
- Secret storage and token-protection design.
- PII handling and data-minimization boundaries.
- MCP-specific controls and why they reduce disclosure risk.
- Known limitations and residual risks.
- Future improvements, each marked as not currently implemented.
- Safe evidence identifiers that point to logical subsystems or documentation titles without exposing local paths.

Every claim has one of these statuses:

- `implemented`: verified in the current repository or deployed configuration.
- `operational`: verified behavior of the current private deployment.
- `planned`: a proposed improvement that is not implemented.

The manifest must not contain:

- Secret values or hashes.
- Environment-variable values.
- Production domains or tunnel identifiers.
- Absolute filesystem paths.
- Email addresses or provider account identifiers.
- Database row values, transcripts, quiz content, or other user-generated content.
- Raw configuration dumps.

## MCP Tools

### `get_architecture_overview`

Returns a safe overview of the current product and technical architecture.

Input:

- `focus`, optional enum: `system`, `data_flow`, `deployment`, or `components`.
- `latestUserMessage`, optional string used only for response-language selection.

Output:

- Product summary.
- Current architecture.
- Major components.
- Relevant data flow.
- Current tradeoffs.
- Response language.
- Claim statuses and safe evidence identifiers.

The tool must not accept a file path, URL, SQL statement, shell command, user ID, or arbitrary retrieval target.

### `explain_security_and_privacy`

Explains security and privacy boundaries for a selected topic.

Input:

- `topic` enum: `mcp`, `authentication`, `authorization`, `secrets`, `pii`, or `deployment`.
- `latestUserMessage`, optional string used only for response-language selection.

Output:

- Implemented controls.
- Why each control reduces risk.
- What the control does not guarantee.
- Residual risks.
- Planned improvements, explicitly marked `planned`.
- Response language.
- Claim statuses and safe evidence identifiers.

For MCP disclosure questions, the answer must explain that leakage is constrained by capability design rather than claim that leakage is impossible. The key reasons are:

- The Architecture MCP receives only a reviewed static manifest.
- Its tool schemas expose no arbitrary file, query, URL, or user selector.
- Its route does not construct database-backed learning services.
- It returns an allowlisted response shape.
- Authentication limits who may invoke it.

Residual risk must include the possibility of accidentally committing sensitive content to the manifest or introducing an unsafe tool in a future change. Review and automated denylist tests reduce these risks but cannot mathematically eliminate them.

### `answer_technical_interview_question`

Builds a grounded interview answer from the public-safe manifest.

Input:

- `question`, required string, 1 to 2,000 characters.
- `depth` enum: `brief`, `standard`, or `deep_dive`; default `standard`.
- `latestUserMessage`, optional string used only for response-language selection.

Output:

- Direct answer.
- Current implementation facts.
- Design reasoning and tradeoffs.
- Planned improvements, explicitly marked `planned`.
- Follow-up points an interviewer may ask.
- Response language.
- Claim statuses and safe evidence identifiers.

The tool does not use general repository retrieval. It may select only from manifest entries using deterministic topic matching. ChatGPT may phrase the returned facts conversationally, but it must not upgrade `planned` claims to `implemented`.

## Authentication and Resource Separation

The endpoint requires a valid bearer token issued by the existing Skill Compass OAuth flow with PKCE S256. Token validation remains bound to the configured allowed Skill Compass user.

The Architecture protected-resource metadata identifies the Architecture MCP URL. OAuth discovery may continue to point at the shared issuer. The first release may reuse the existing token audience model because the deployment is single-user, but the route still performs bearer authentication independently.

The following separation is mandatory:

- A dedicated Architecture MCP server factory registers only the three read-only tools.
- All tool annotations set `readOnlyHint: true` and `destructiveHint: false`.
- The Architecture HTTP handler receives the manifest and authentication dependency only.
- No Architecture tool imports the database, quiz service, Podcast service, storage client, provider SDK, filesystem APIs, or environment access.
- The response builder returns only named fields from the manifest; it never serializes arbitrary objects.

Audience-scoped tokens for each MCP resource are a future improvement and must be described as `planned`, not implemented.

## Language Behavior

The tools return a `responseLanguage` hint:

- Japanese when `latestUserMessage` contains substantive Japanese text.
- English otherwise.

The manifest may store canonical technical facts in English. ChatGPT presents them in the selected language without changing claim status, component names, or security meaning.

## Scheduled-Task Conversation

The Architecture MCP does not run automatically at 07:00. The existing scheduled learning task keeps its Today and Podcast behavior unchanged.

After the new ChatGPT app connection is installed, update the task instructions so that:

- Today and Podcast requests continue to use the learning MCP.
- Questions about how Skill Compass was built, its architecture, security, privacy, or MCP data boundaries use the Architecture MCP.
- Technical answers identify current facts separately from planned improvements.
- The task never invokes Architecture tools merely to prepare the daily quiz.

## Safety and Disclosure Testing

### Unit tests

- All Architecture tools are registered as read-only.
- Tool schemas reject unknown topics and unsupported depth values.
- Language selection returns Japanese for Japanese input and English otherwise.
- Each response contains only its documented allowlisted fields.
- Planned entries remain labeled `planned`.
- Interview answers are assembled only from manifest entries.

### Manifest safety tests

The checked-in manifest fails validation if it contains:

- An email-address pattern.
- An absolute Unix or Windows path.
- A URL with a non-example hostname.
- Common private-key or bearer-token markers.
- Values resembling configured secret assignments.
- Unsupported claim statuses.

These checks are guardrails, not proof that disclosure is impossible. Human review remains required whenever the manifest changes.

### Integration tests

- Missing, invalid, or revoked bearer credentials receive a non-disclosing unauthorized response.
- The Architecture endpoint exposes exactly three tools.
- The learning endpoint retains its existing five tools.
- Architecture requests never instantiate learning services.
- Protected-resource metadata advertises the correct Architecture resource.

### End-to-end verification

- Connect the Architecture MCP to ChatGPT through OAuth.
- Ask for a system overview in English.
- Ask in Japanese why secrets and PII cannot normally be read through this MCP.
- Confirm the answer describes capability boundaries and residual risk rather than promising impossibility.
- Ask for an interview answer and confirm current facts and planned improvements are separated.
- Confirm Today and Podcast tools still work from the same conversation.
- Update and manually run the scheduled task instructions once before leaving the recurring schedule enabled.

## Operations

The Architecture endpoint shares the existing Next.js process, HTTPS tunnel, monitoring boundary, and OAuth persistence. It adds no database tables and no background worker.

Operational logs may include request ID, tool name, status, and latency. They must not include bearer tokens, full user questions, manifest response bodies, or OAuth authorization data.

Updating technical knowledge requires:

1. Editing the public-safe manifest.
2. Running manifest safety and MCP contract tests.
3. Reviewing claim statuses against the current implementation.
4. Deploying the updated Next.js build.

## Future Improvements

The following are explicitly not part of the first implementation:

- Separate OAuth client registration and audience-scoped tokens for the Architecture resource.
- A signed manifest and release-time provenance record.
- Automated extraction of candidate architecture changes for human approval.
- A CI policy that requires security-owner approval for manifest or Architecture tool changes.
- A hosted deployment that removes the local-origin uptime dependency.

These items may be discussed in interviews as reasoned next steps, but must always be labeled `planned`.
