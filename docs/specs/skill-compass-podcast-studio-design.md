# Skill Compass Podcast Studio Design

Status: proposed public design

Last reviewed: 2026-07-10

## Purpose

Podcast Studio turns trusted engineering sources, current news, selected social posts, and a user's calendar into a private two-speaker audio briefing. It is designed for hands-free learning during a commute or walk while preserving source attribution, user privacy, and predictable operating costs.

This is a post-MVP capability. The document describes the intended architecture and does not claim that the feature is implemented.

## Product Principles

- Use primary sources as the factual baseline.
- Treat news and social posts as discovery material and public reaction, not standalone proof.
- Keep private inputs private by default.
- Request the minimum OAuth scopes required for each feature.
- Make long-running generation resumable, observable, and safe to retry.
- Keep LLM, speech, storage, queue, calendar, and social integrations replaceable.
- Put cost limits around every metered provider.
- Require explicit administrator approval before publishing externally.

## User Experience

The mobile navigation gains a fifth destination:

```txt
Dash / Today / Podcast / Archive / Settings
```

The Podcast page contains:

- the latest episode and playback controls
- a persistent mini player while navigating the app
- current generation progress
- episode history
- manual generation
- playback and download actions
- source citations and generation metadata

Podcast settings live on a separate page and include:

- generation time, timezone, and weekdays
- target duration
- Sources enabled by default
- news, social, and calendar inputs
- Japanese output by default
- an administrator-only option to also generate an English edition
- authenticated private RSS as an optional beta delivery channel

The application player is the canonical playback experience. It requires an authenticated Skill Compass session. Background playback on iPhone and authenticated private RSS playback in Apple Podcasts require explicit device testing before release.

## Source Scheduling

Source collection cadence and episode cadence are separate settings.

Each Source can be configured with:

- podcast inclusion on or off
- source type
- trust tier
- fetch interval, such as daily, every 3 days, weekly, every 14 days, or monthly
- last successful fetch time
- next scheduled fetch time

Each user can configure episode generation as daily, weekdays only, weekly, or manual. At the scheduled time, all due inputs are collected into one briefing rather than one episode per Source.

If no news, Source updates, social posts, or calendar events are available, generation is skipped and the reason is recorded. Calendar events alone may produce a short briefing.

## Content Inputs

### Sources and News

Primary documentation, specifications, release notes, and maintainer material anchor factual claims. News and community sources provide context and discovery. Generated scripts retain citations and clearly distinguish established facts from commentary.

The system stores only the excerpts required for generation, along with source identifiers, URLs, timestamps, and hashes. It does not reproduce entire third-party articles.

### Google Calendar

Calendar access uses per-user Google OAuth. By default, the briefing reads only event start times and titles. Location, description, and attendees require separate explicit opt-in settings.

The user chooses which calendars and date window are included. The initial date windows are today, tomorrow, and the next seven days. Calendar data is minimized before it is sent to a model.

### X Public Sources

Public account and keyword collection uses an application-level X API integration. Users do not need to connect their personal account for this input type.

Public social posts are treated as lower-trust context. They are summarized with attribution and are not used as the sole basis for factual claims.

### X Personal Sources

Personal X inputs are a Pro entitlement. A Pro user may connect X with OAuth 2.0 Authorization Code with PKCE and independently enable:

- reverse-chronological home timeline
- bookmarks

Both inputs remain off after connection until the user explicitly enables them. The user can configure time windows, post limits, excluded accounts, excluded terms, and bookmark priority.

Personal-source collection requests only read scopes. Publishing scopes are requested separately and only when an administrator enables publishing.

Raw personal social data has a short retention window. Episode citations and source identifiers remain available for the lifetime of the episode unless the episode is deleted.

## Generation Pipeline

Podcast generation uses a durable MySQL-backed job pipeline.

```txt
manual action or scheduler
          |
          v
   create episode + job
          |
          v
queued -> collecting -> scripting -> synthesizing -> ready
```

The web request creates work and returns quickly. A worker claims queued jobs, records a lease, performs one stage, and persists the result before moving to the next stage.

Successful stages are not repeated after a later stage fails. For example, a speech synthesis failure retries speech synthesis without recollecting sources or regenerating the script.

The queue stores:

- job type and status
- episode and user ownership
- attempt count
- lease owner and lease expiration
- next retry time
- sanitized failure code
- created, started, and completed timestamps

An idempotency key prevents duplicate episodes for the same user, local date, language, and schedule trigger. Workers use row locking or an atomic claim operation so only one worker owns a job at a time.

The initial implementation is intentionally smaller than a distributed message broker. A `JobQueue` boundary permits a future `MySqlJobQueue` to be replaced with an `SqsJobQueue` without changing generation services.

## Pipeline Stages

### Collecting

The collector loads all inputs due for the episode, applies source trust and privacy rules, deduplicates repeated items, and records a bounded input snapshot.

### Scripting

The script generator creates a two-speaker Japanese transcript with citations. When the administrator enables an English edition, the English transcript is a separate episode asset derived from the same bounded source snapshot.

### Synthesizing

The speech provider converts the transcript into two-speaker audio. The initial candidate is a Gemini multi-speaker TTS model, but the model identifier is configuration rather than application logic.

### Ready

A ready episode can be played, downloaded, or delivered through an enabled authenticated feed. Audio binaries are stored through an `AudioStorage` provider, not in MySQL.

### Publishing

External publishing is separate from the generation pipeline:

```txt
ready -> administrator review -> approved -> publishing -> published
```

Publishing failure never makes a ready private episode unavailable.

## Replaceable Interfaces

```txt
ContentCollector    Sources / news / X / calendar
ScriptGenerator     Gemini or another text model
SpeechSynthesizer   Gemini TTS or another speech service
AudioStorage        local filesystem / object storage
SocialPublisher     X / future social platforms
JobQueue            MySQL / future managed queue
```

Provider contracts return structured results and normalized failure codes. Provider-specific payloads do not leak into page components or core episode state transitions.

## Model Direction

As of the review date, Gemini offers multi-speaker TTS models suitable for podcast-style generation. The initial development candidate is a cost-oriented Flash TTS model, with a higher-quality model available through configuration.

TTS accepts a completed transcript and produces audio. Script generation and speech synthesis therefore remain separate provider calls and separate job stages.

Model names, prices, quotas, and preview status can change. They are configuration and operator documentation, not hard-coded product guarantees.

## Access Model

Authorization and commercial access are separate concepts.

- `role`: `admin` or `normal`, with room for future roles
- `plan`: `free` or `pro`, with room for future plans
- `entitlement`: a named capability granted by plan defaults and optional user overrides

Initial capability identifiers include:

- `podcast.sample.view`
- `podcast.generate`
- `podcast.download`
- `calendar.connect`
- `x.personal_sources`
- `x.publish`
- `access.manage`

Plan defaults are evaluated first, followed by user-specific overrides. Administrative access management cannot be removed from the final active administrator through the same UI.

The initial policy is:

- Free users can view and play designated samples.
- Pro users can generate, connect Calendar and personal X sources, play, download, and use eligible private delivery features.
- Administrators receive Pro capabilities plus access management, integration administration, English-edition generation, and approved X publishing.

Payment processing is outside the first Podcast Studio implementation. The data model supports plan assignment before billing automation is introduced.

## Administrator Experience

Administrative settings have a desktop-first three-pane layout:

```txt
left navigation | users or settings list | selected item details
```

Sections include Access, Plans, Users, Integrations, and Audit. On mobile, the details pane becomes a separate drill-in screen.

Administrators can edit plan entitlement defaults and user overrides. They can view operational metadata for another user's episode but cannot normally view its transcript, audio, or calendar content.

## OAuth and Secrets

Google Calendar and personal X connections use per-user OAuth. Skill Compass never asks users to type their Google or X password.

OAuth uses state validation and PKCE where supported. Read and publish permissions are separate consent steps. Revoking a connection or losing the required entitlement stops future collection and publishing.

OAuth tokens and provider API keys are encrypted at rest with authenticated encryption. The encryption key is supplied through the deployment secret system and is never stored in the application database. Stored secrets are not shown again in the UI. Key rotation metadata permits future re-encryption.

Password-like credentials that never need recovery, including login and private-feed passwords, are stored as salted hashes.

No credentials, personal accounts, callback values, private source lists, or operational posting details belong in the public repository.

## X Publishing

X does not accept an audio-only podcast file as normal Post media. The publishing pipeline creates a short MP4 audiogram with static artwork, captions, and a bounded audio excerpt. The Post links to the full episode.

The administrator reviews:

- the selected excerpt
- generated artwork or template
- captions
- Post text
- destination account

Publishing occurs only after explicit approval. Automatic publishing is a future opt-in and is not part of the initial release.

X API usage is metered. The application applies per-user daily collection limits, a global monthly budget, cached source reuse, and a hard stop when the configured budget is reached.

## Playback and Private Delivery

The authenticated Skill Compass player is the primary delivery path. Audio endpoints enforce episode ownership and support HTTP byte-range requests for seeking and resuming.

Authenticated private RSS is an optional beta. Each user receives revocable feed credentials. The feed is blocked from public directory ingestion and exposes generic episode metadata rather than calendar details.

Because podcast clients must retain reusable credentials to fetch later episodes, private RSS is not equivalent to a short-lived web session. The feature ships only after an iPhone compatibility and credential-revocation spike. Users who prefer stronger session controls can leave RSS disabled and use the Skill Compass player.

## Data Model

The intended logical tables are:

- `users`: role, plan, status
- `entitlements`: capability catalog
- `plan_entitlements`: plan defaults
- `user_entitlement_overrides`: explicit grants and denials
- `connections`: encrypted OAuth connection metadata
- `podcast_settings`: schedule, timezone, duration, language, enabled inputs
- `source_podcast_settings`: per-source inclusion and cadence
- `podcast_episodes`: ownership, pipeline status, source snapshot, retention state
- `podcast_assets`: language, storage reference, media type, duration, size
- `podcast_jobs`: durable queue and retry state
- `podcast_feed_credentials`: revocable private-feed authentication
- `audit_logs`: security-sensitive and administrative actions

Role and capability identifiers should not use MySQL enums if that would make future additions require avoidable schema changes.

## Retention and Emergency Access

Active episode content remains until the user deletes it. Deleted content is recoverable for 30 days and then permanently removed. Audit metadata is retained for one year.

A legal hold prevents scheduled deletion for a specifically identified record. Legal hold does not grant ordinary content access.

Emergency content access is a break-glass operation requiring:

- an administrator with the required capability
- recent reauthentication
- a recorded reason
- an immutable audit event
- notification or review according to the deployment's policy

The public design documents the control objectives but not private operational credentials or incident runbooks.

## Failure Handling

- A failed Source is excluded when enough other material exists.
- An expired Calendar or X connection pauses only that input and asks the user to reconnect.
- Script or speech failures retry with increasing delays and a fixed attempt limit.
- A failed job preserves completed stage output and exposes a safe retry action.
- A worker that loses its lease cannot commit a later result over the new owner.
- A budget limit stops new metered calls and records a budget-blocked state.
- A publishing failure leaves the private episode ready and playable.
- A storage failure never records an episode asset as ready.

## Testing Strategy

Unit tests cover:

- entitlement resolution
- source scheduling and trust ordering
- episode state transitions
- retry delays and terminal failure
- idempotency key generation
- retention and legal-hold decisions
- budget calculations

Integration tests cover:

- atomic MySQL job claims and lease expiry
- provider contracts with mocked HTTP responses
- OAuth state and PKCE validation
- token encryption and key identifiers
- authenticated audio range requests
- private-feed authentication and revocation
- audit log creation

End-to-end tests cover:

- Free, Pro, and administrator access boundaries
- mobile generation, progress, playback, and download
- Calendar and X connection states with mocked providers
- desktop access management
- administrator review and publishing approval

Manual release checks cover:

- iPhone background playback
- authenticated private RSS in Apple Podcasts
- Google OAuth callback configuration
- X OAuth scopes and token refresh
- X audiogram upload and processing
- worker recovery after process interruption

CI never uses production credentials or live social posting.

## Delivery Phases

1. Access foundation: roles, plans, entitlements, and desktop administration.
2. Podcast core: manual jobs, scripts, two-speaker audio, playback, and download.
3. Scheduled briefing: Source cadence, automatic generation, and Calendar.
4. Personal sources: Pro X timeline and bookmarks with budgets.
5. Background delivery: authenticated player hardening and private RSS beta.
6. Administrator publishing: English edition, audiogram, review, and X publishing.
7. Retention and operations: legal hold, break-glass access, and audit review.

## Operator Setup Checklist

The implementation must clearly surface setup work that cannot be completed in source code alone:

- configure a Gemini API key and spending limit
- create an application encryption secret
- enable the Google Calendar API
- configure the Google OAuth consent screen, client, scopes, and callback URL
- create or configure an X developer application
- configure X OAuth scopes, callback URL, credits, and spending limit
- choose and configure production audio storage
- run the scheduler and job worker
- expose an HTTPS endpoint before testing private RSS
- complete iPhone background playback and private-feed compatibility checks

The repository contains placeholders and setup documentation only. Real values remain in the deployment's secret management system.

## Public References

- [Gemini text-to-speech generation](https://ai.google.dev/gemini-api/docs/speech-generation)
- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Google Calendar API authorization](https://developers.google.com/workspace/calendar/api/auth)
- [X OAuth 2.0 Authorization Code with PKCE](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code)
- [X home timelines](https://docs.x.com/x-api/posts/timelines/introduction)
- [X bookmarks](https://docs.x.com/x-api/posts/bookmarks/introduction)
- [X API pricing](https://docs.x.com/x-api/getting-started/pricing)
- [Apple Podcasts private RSS distribution](https://podcasters.apple.com/support/5108-how-apple-podcasts-distributes-your-shows-to-listeners)

## Public Repository Boundary

This design is intentionally suitable for a public repository. It excludes credentials, personal account identifiers, private environment details, private source catalogs, unpublished prompts, incident runbooks, and operational social media strategy.
