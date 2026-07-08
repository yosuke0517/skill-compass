# Skill Compass Lite Design

Status: public design brief

## Purpose

Skill Compass is a personal engineering growth app for developers working in an AI-assisted era. It helps users practice fundamentals, catch up with modern engineering topics, identify weak spots, and track the gap between self-perceived skill and measured performance.

The app is designed around a simple loop:

1. Review current skill state.
2. Answer a short adaptive quiz.
3. Get immediate feedback.
4. Update measured skill scores.
5. Save durable learning notes for future review.

## Core Product

The MVP is a standalone web application with:

- A dashboard-first experience.
- Five visible skill axes:
  - Frontend
  - Backend
  - Infrastructure
  - SQL
  - LLM
- Internal tracking for subskills and concrete concepts.
- Daily 5-question quizzes.
- Weekly summaries.
- Monthly self-assessment reviews.
- Source-backed question generation.
- Markdown-based knowledge export.

## Skill Model

The product separates broad skill areas from concrete learning targets.

```txt
Category: Frontend
  Tag: TypeScript
    Concept: satisfies operator
    Concept: const type parameters
  Tag: Design System
    Concept: design token
    Concept: component variant

Category: Infrastructure
  Tag: Networking
    Concept: NAT
    Concept: reverse proxy
    Concept: DNS
```

- `Category` is the public dashboard axis.
- `Tag` is a broader subskill used for scoring and quiz balancing.
- `Concept` is a concrete thing the user can misunderstand, review, or master.

Concepts may relate to multiple tags, so the data model should support many-to-many relationships.

Examples:

- `MCP` can relate to LLM workflows, frontend implementation, and developer tooling.
- `API contract` can relate to backend design, frontend integration, and testing.
- `index design` can relate to SQL and backend performance.

## Difficulty Model

Difficulty uses three levels.

- `beginner`
  - Explains terms, roles, and basic distinctions.
  - Example: identifying the difference between NAT, DNS, and a reverse proxy.
- `intermediate`
  - Applies concepts in realistic engineering decisions.
  - Example: choosing a testing strategy or explaining a database indexing tradeoff.
- `advanced`
  - Understands recent specifications and current best practices.
  - Can compare options, explain tradeoffs, and guide a team or LLM toward a correct implementation.

## Daily Quiz Flow

Each day contains five questions.

Suggested mix:

- 2 weakness reinforcement questions.
- 1 strength extension question.
- 1 latest technology catch-up question.
- 1 balancing question from underrepresented skills or large self-assessment gaps.

Each answer includes:

- a 4-choice selection
- a confidence score
- short free-text reasoning

After submission, the app evaluates:

- correctness
- reasoning quality
- misunderstood concepts
- next review timing
- score updates

## Score Updates

The app should not fully delegate scoring to an LLM. LLM feedback can provide structured evaluation metadata, but final score changes should be deterministic application behavior.

Example rules:

- Correct, high confidence, good reasoning: increase score.
- Correct, low confidence: small increase and keep as review candidate.
- Incorrect, reasoning close: small penalty or neutral update.
- Incorrect with a major misconception: larger penalty and earlier review.
- Repeated correct answers extend the review interval.

Scores are tracked at category, tag, and concept levels. Category scores shown in the dashboard are derived from lower-level scores.

## Self-Assessment

The app tracks both measured performance and self-perceived skill.

Onboarding includes:

1. Self-rating across the five categories.
2. Optional tag-level self-rating.
3. Diagnostic quiz.
4. Gap calculation between self-rating and measured performance.

Monthly reviews ask the user to update self-assessments and reflect on:

- underconfidence
- overconfidence
- areas improving faster than expected
- areas that need focused practice

## Source Strategy

Questions should be grounded in sources.

The app supports:

- fixed trusted sources
- user-added URLs
- source trust tiers
- official verification status

Suggested trust tiers:

- Tier 1: official documentation, release notes, specifications, RFCs
- Tier 2: official blogs and maintainer-authored material
- Tier 3: community articles and technical blogs
- Tier 4: social posts or unverified commentary

Community articles are useful for discovery and practical framing, but factual quiz answers should be backed by official or high-trust sources whenever possible.

## Knowledge Export

The app exports learning artifacts as Markdown so they remain portable and easy to read.

Suggested structure:

```txt
Skill Compass/
  daily/
  weekly/
  monthly/
  concepts/
  sources/
```

Daily logs include:

- answered questions
- correctness
- confidence
- reasoning
- feedback
- score changes
- next review dates

Concept notes include:

- current understanding
- common misunderstandings
- related concepts
- quiz history
- sources

Weekly logs include:

- score changes
- weak points
- strong points
- next week focus

Monthly logs include:

- self-vs-measured gap
- reflection
- next month focus

## MVP Screens

Required screens:

- Login
- Dashboard
- Today's quiz
- Skills
- Concepts
- Sources
- Settings

Dashboard should show:

- five-axis radar chart
- today's quiz progress
- streak
- weekly accuracy
- top weak points
- improving tags
- self-vs-measured skill gap
- weekly/monthly review prompts

## Technical Direction

The intended MVP stack is:

- Next.js App Router
- TypeScript
- MySQL
- Drizzle ORM
- Docker Compose for local deployment
- A pluggable LLM provider interface
- A pluggable Markdown note writer
- Scheduled jobs implemented as application-level commands

Scheduled jobs should be portable. A local scheduler can run them during self-hosting, while cloud schedulers can run the same commands later.

Jobs include:

- daily quiz preparation
- source ingestion
- weekly summary
- monthly self-assessment prompt
- Markdown export sync

## Error Handling

Key failure behavior:

- If question generation fails, reuse existing questions.
- If answer evaluation fails, save the answer and retry evaluation later.
- If source fetching fails, mark the source as failed and avoid unverified factual claims.
- If Markdown export fails, keep database state and retry export.
- If usage limits are reached, stop new generation and fall back to existing questions or simple scoring.

## Testing Strategy

Test coverage should include:

- scoring logic
- quiz selection logic
- self-assessment gap calculation
- Markdown generation
- database integration
- authentication
- quiz E2E flow
- scheduled job behavior with mocked LLM responses

## Public Repository Boundary

This document is intentionally public-safe. It describes product and technical design without including:

- private local paths
- private project names
- personal automation details
- credentials
- unpublished operational logs
- sensitive business context

