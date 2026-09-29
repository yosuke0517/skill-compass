# Today answer and progress guidance

Scope: Today submission, saved progress and completion, including design-only and QA work.

## Product decisions

- Save each submitted answer independently; completing all five questions or using
  Add 5 is not a prerequisite. Selecting a choice without submitting is not saving.
- Distinguish persisted raw answers, finished evaluation and completed practice.
  Do not describe a pending evaluation as completed practice.
- A saved claim needs server-confirmed state. An unsuccessful submission must not
  create a new saved claim. Previously saved answers still remain saved.
- Returning to Today after stopping partway must recover submitted answers without
  requiring the learner to complete the set. Add 5 adds practice; it is not a save button.

## Sources to inspect when relevant

- [Card navigation specification](../superpowers/specs/2026-07-12-today-card-navigation-design.md)
- [Submission action](../../src/app/actions/quiz.ts) and [persistence/evaluation](../../src/lib/quiz/submit-answer.ts)
- [Navigator](../../src/components/quiz/quiz-card-navigator.tsx) and [web answer mapping](../../src/lib/quiz/web-today-quiz.ts)

## Verification

Check partial submission followed by a fresh load, failed submission, pending
assessment, completed practice and optional additional questions. Use an isolated
test account and data. Confirm that the test setup matches the current data adapter;
historical fixtures are not evidence of compatibility.

[Component tests](../../tests/unit/quiz-card-navigator.test.tsx) and
[answer tests](../../tests/integration/submit-answer.test.ts) cover different layers.
Mocked component success does not prove persisted reload or real-device behavior.
Report the revision, environment, actual checks and anything not run under the
[shared workflow](../agents/workflow.md).
