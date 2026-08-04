# Practical Today Learning Design

## Goal

Change Skill Compass Today from a definition-first quiz into a reviewed,
case-based learning system that develops practical engineering judgment.

The learner should practice:

- recognizing when a technique applies;
- choosing based on explicit constraints;
- comparing benefits, costs, and trade-offs;
- predicting the failure caused by a poor choice; and
- connecting the decision to code, SQL, API contracts, configuration, or
  architecture.

The same reviewed lesson must be used by the Web UI, the learning MCP, the
scheduled Daily Lesson, and ChatGPT Voice/Live.

## Scope

This release includes:

- a shared, reviewed question bank stored in MySQL;
- 70 practical questions across seven engineering categories;
- complete replacement of active definition-first questions;
- user-scoped daily quiz assignment, answers, scores, and history;
- richer Web answer review;
- richer MCP instructor data and Voice/Live teaching instructions;
- migration of existing singleton learning data to `user_local`;
- automated content and tenant-isolation validation; and
- updates to the public architecture showcase, READMEs, Architecture MCP
  manifest, and ChatGPT MCP runbook.

This release does not include:

- daily LLM generation of questions;
- an authoring or review administration UI;
- automatic publication of generated candidate questions; or
- a change to the existing five-questions-per-day product rule.

## Learning Coverage

The reviewed bank contains ten active questions in each category:

1. **Computer science foundations**
   - data structures
   - algorithms
   - operating systems
   - networking
   - databases
2. **Web and backend**
   - HTTP
   - APIs
   - authentication
   - caching
   - asynchronous processing
3. **Frontend**
   - TypeScript
   - browsers
   - state management
   - accessibility
4. **Infrastructure**
   - cloud
   - containers
   - CI/CD
   - observability
5. **Security**
   - authorization
   - vulnerabilities
   - secret handling
   - supply-chain security
6. **System and software design**
   - distributed systems
   - maintainability
   - trade-offs
7. **Engineering in the AI era**
   - LLMs
   - RAG
   - agents
   - MCP
   - evaluation
   - safety

Every listed subtopic has at least one active question. Important subtopics may
have more than one question while the category total remains ten.

The six concepts already present in the seed data—`satisfies`, design tokens,
API contracts, reverse proxies, index design, and MCP—remain useful topics
inside this broader taxonomy. They are not top-level product categories.

## Question Model

Each reviewed question contains:

- `scenario`: a short practical situation with every condition needed to reach
  one unambiguous answer;
- `artifacts`: zero or more typed supporting artifacts;
- `prompt`: a direct decision question;
- `choices`: exactly four plausible engineering decisions;
- `decisionCriteria`: the facts in the case that determine the answer;
- `rationale`: a concrete explanation tied to those facts;
- `practicalNotes`: concise implementation or operational guidance;
- `checkQuestion`: one short transfer or understanding check;
- `caseType`: the learning angle;
- `difficulty`: `beginner`, `intermediate`, or `advanced`;
- the existing concept and reviewed source relationships; and
- `active`: whether the question can be assigned to a new quiz.

Supported artifact kinds are:

- `code`
- `sql`
- `schema`
- `api`
- `config`
- `diagram`

Each artifact contains a title, kind, optional language, and content. Code is
stored as source text, not executable HTML. TypeScript examples use a
TypeScript language identifier and valid TypeScript syntax rather than
JavaScript presented as TypeScript.

Each choice contains:

- `id`: one of `a`, `b`, `c`, or `d`;
- `label`: the proposed decision;
- `correct`: a boolean;
- `explanation`: why the choice is appropriate or inappropriate under the
  stated conditions; and
- `consequence`: the likely practical result of choosing it.

Exactly one choice is correct. Incorrect choices are credible mistakes or
near-misses seen in real engineering work. Joke answers, unrelated trivia,
“all of the above,” “none of the above,” and overlapping answers are rejected.

The five case types are:

- `basic_application`
- `common_failure`
- `design_tradeoff`
- `debugging_performance`
- `maintainability_safety`

## Storage Boundary

Question content is common instructional material. Learning state belongs to a
user.

### Shared content

The following data is shared:

- categories, tags, concepts, and reviewed sources;
- questions and supporting artifacts;
- choice explanations and consequences; and
- activation and difficulty metadata.

Shared content never contains a learner's answer, score, personal source, or
profile data.

### User-owned learning state

The following data is scoped by `userId`:

- daily quiz days;
- the five question assignments and selection reasons;
- submitted choice, confidence, and reasoning;
- evaluation feedback and review date;
- concept, tag, and category scores; and
- category and tag self-assessments; and
- answer history.

`quiz_days` is unique by `(userId, quizDate)`. A quiz day ID is also
user-specific so two users cannot collide on the same date.

Answer and score repositories require a user ID. Read and write queries include
that user ID even when a related quiz-day row would imply ownership. This
defense-in-depth rule prevents a missing join or guessed identifier from
crossing the user boundary.

The translation cache may remain shared because it contains canonical lesson
text and translated lesson text, not user learning state.

## Existing Data Migration

The current schema is a singleton learning model. The migration:

1. adds the required ownership columns and user-scoped unique indexes;
2. backfills existing quiz days, answers, scores, and self-assessments to
   `user_local`;
3. preserves existing question IDs referenced by history;
4. marks every legacy definition-first question inactive;
5. inserts the reviewed taxonomy and 70 new active case questions;
6. creates user-specific quiz-day identifiers for new assignments; and
7. ensures subsequent reads and writes require an authenticated user ID.

Legacy questions and answers are not deleted. Archive pages can still display
their original prompt, selected choice, result, and feedback.

After deployment, `user_local` receives a new user-scoped quiz for the current
local date. The old singleton quiz remains historical and is not selected by
the new query path.

Migration and seed execution must be idempotent. Rerunning them must not create
duplicate questions, reset learner scores, reactivate legacy questions, or
rewrite past answers.

## Daily Selection

Today still assigns five questions. Selection occurs independently for each
user and uses only that user's scores and history.

The selector:

- prioritizes weak concepts and due reviews;
- mixes review, balanced coverage, and appropriate stretch;
- avoids questions recently assigned to that user;
- avoids excessive concentration in one category or case type;
- does not place definition-only questions into the quiz;
- balances correct choice IDs across the five slots when suitable questions
  are available; and
- remains deterministic for the same user, local date, question bank, and
  learning state.

Correct-choice-ID balancing is a content and selection quality rule, not a
reason to choose a pedagogically inferior question. The selector never changes
the answer ID of an already-reviewed question at runtime.

When fewer than five eligible questions exist, Today returns the eligible
questions rather than activating legacy content or inventing questions.

## Web Experience

Before submission, a Today card displays:

- scenario;
- supporting artifacts with safe preformatted rendering;
- decision prompt; and
- four choices.

It does not display correctness, decision criteria, rationale, choice
explanations, consequences, or instructor notes.

The learner submits:

- selected choice;
- confidence from 1 to 5; and
- reasoning.

After evaluation, the card displays in this order:

1. correctness;
2. the decisive case conditions;
3. correct-answer rationale;
4. why every choice is appropriate or inappropriate;
5. likely consequences of poor choices;
6. practical notes; and
7. the short understanding check.

The existing one-card-at-a-time mobile interaction remains. Code and structured
artifacts must scroll safely on narrow screens without forcing the entire page
width to expand.

> **2026-08-04 follow-up:** Answer confidence is now optional reflection
> metadata. A selected choice and non-empty reasoning complete an answer.
> Confidence does not affect Today scoring or review intervals. The separate
> self-assessment-versus-measured-score gap remains unchanged.

## MCP Contract

`get_today` remains read-only and returns progress, the next unanswered
question, and the complete scheduled-lesson instructor pack.

`nextQuestion` contains:

- quiz and question IDs;
- slot;
- scenario;
- artifacts;
- prompt; and
- choice IDs and labels.

It does not contain:

- correctness flags;
- the correct choice ID;
- decision criteria;
- rationale;
- choice explanations or consequences; or
- practical notes.

`instructorPack` contains all five lesson rows plus:

- correct choice ID;
- decision criteria;
- rationale;
- explanations and consequences for all choices;
- practical notes;
- understanding check; and
- an existing answer when present.

The instructor pack is intended for the scheduled Daily Lesson conversation so
Voice/Live can teach without calling an app during the live session. It is
lesson data, not a substitute for answer submission. Automatic preparation
must never call `submit_today_answer`.

`submit_today_answer` continues to require the quiz ID, question ID, selected
choice ID, confidence, and reasoning. The authenticated user is derived from
the MCP bearer token and is never accepted from model-controlled tool input.

## Voice/Live Teaching Behavior

When the learner says “Skill CompassのTodayやりたい” in the prepared
conversation, the teacher uses one question at a time.

For each question it:

1. presents the scenario, necessary artifact, prompt, and choices;
2. asks for the selected choice, confidence from 1 to 5, and reasoning;
3. withholds the answer until the learner commits;
4. gives a bounded hint pointing to an explicit case condition when needed;
5. asks “why not the other option?” when the reasoning is weak;
6. reports correctness;
7. explains the decisive condition;
8. connects the decision to practical implementation;
9. explains the consequence of the learner's chosen wrong option when
   applicable; and
10. asks the stored short understanding check.

The teacher does not invent missing constraints, silently reinterpret the
question, or claim that multiple answers are correct. If lesson data is
incomplete, it reports the incomplete item and moves on rather than improvising
a hidden premise.

At the end, Voice/Live produces the existing SYNC PACK. A later normal-chat
request may submit complete items through `submit_today_answer`. Partial items
are not submitted.

## Content Quality Gates

Automated validation fails the build or seed verification when:

- the active bank is not exactly 70 questions;
- a category does not contain exactly ten active questions;
- a declared subtopic has no active question;
- a question does not have four unique choices and exactly one correct answer;
- any choice lacks an explanation or consequence;
- scenario, prompt, decision criteria, rationale, practical notes, or
  understanding check is empty;
- case-type or difficulty values are unsupported;
- duplicate normalized prompts or materially duplicate question IDs exist;
- correct choice IDs are unreasonably concentrated across the bank;
- one category omits a case type without an explicit content-fixture
  justification;
- a TypeScript artifact is mislabeled or fails TypeScript syntax validation;
  or
- an artifact contains unsafe HTML rather than source text.

Content fixtures also assert that rationales reference concrete case conditions
instead of generic statements such as “this expresses the correct property.”

SQL, API, configuration, and diagram artifacts receive fixture-level review
and targeted tests for their declared shape. They are never executed against
production infrastructure.

## Security and Privacy

The multi-user migration is an authorization change, not only a schema change.

Required controls:

- every Today, answer, score, self-assessment, and history service derives
  `userId` from the authenticated session or MCP token;
- no public request accepts an authoritative user ID;
- repository methods require user scope;
- cross-user quiz IDs and question assignments return not-found or forbidden
  without revealing ownership;
- MCP responses contain only the authenticated user's learning state;
- common lesson content contains no personal data;
- supporting artifacts render as escaped text; and
- existing Architecture MCP disclosure guardrails remain in place.

Tests use two users to prove that user A cannot read, submit, overwrite, score,
or list user B's learning state.

## Documentation

The implementation updates:

- the root `README.md`;
- `docs/README.md`;
- the architecture showcase currently stored as
  `docs/showcase/podcast-studio.html`;
- the public-safe Architecture MCP manifest and interview answers; and
- `docs/runbooks/chatgpt-mcp.md`.

The showcase becomes a Skill Compass product architecture story rather than a
Podcast-only artifact. It explains:

- the original Web-app direction;
- the shift toward Skill Compass as the canonical learning-data and lesson
  platform after ChatGPT Voice/Live;
- shared reviewed content versus user-owned learning state;
- Web, MCP, scheduled lesson, and Voice/Live consumers;
- authentication and data-isolation boundaries;
- the X technical-news and Podcast flows; and
- future diagnostic-exam and cloud-deployment work as planned, not current.

README links use the new showcase title and path if the file is renamed.

The Architecture MCP manifest must no longer describe Today storage as
singleton. It exposes only reviewed public-safe facts and must not include
question content, learner state, account identifiers, hostnames, secrets, or
database values.

## Verification

The release requires:

- migration tests for backfill, indexes, and idempotency;
- question-bank validation tests;
- selector tests for user history, category and case-type balance, recent-item
  avoidance, determinism, and answer-ID diversity;
- service and repository tests with two users;
- history and score isolation tests;
- Web component tests for pre-answer hiding and post-answer teaching content;
- MCP tests for the public next-question boundary and complete instructor pack;
- submission tests proving authenticated ownership;
- runbook smoke tests proving Web and MCP return the same assigned question;
- a scheduled Daily Lesson test proving five questions are prepared without
  submission; and
- a manual Voice/Live pass covering a hint, weak reasoning follow-up,
  explanation, understanding check, and later SYNC PACK submission.

All existing Podcast, X, OAuth, translation, archive, and Architecture MCP
tests must continue to pass.
