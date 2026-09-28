# Shared development workflow

## Before work

Read the applicable instructions, relevant specification and operational guide;
inspect Git status and the deployed/base version where relevant. Clarify material
unknowns in the input, expected output, acceptance criteria and scope. Use dialogue
with the user for upstream decisions; do not invent their approval or business facts.

Record a task using [the compact template](task-record-template.md), normally in
ignored `.private/agent-records/`. The ten stages are specification understanding,
task decomposition, design, QA preparation, implementation, local operation checks,
QA execution, staging deployment, staging QA and production QA. Mark stages that
are not needed with a reason. Keep human decisions separate from agent execution.
Unmeasured time, cost and comparisons stay `not measured`.

Follow the task's existing release requirements. Policy-only PRs do not themselves
require application deployment. Report actual commands/results, target revision,
environment, evidence and outstanding work; an agent's completion statement is not
independent verification. Do not alter CI protections or production gates as a shortcut.

## User feedback

After resolving a user correction, invoke [learn-rules](learn-rules.md). The user
requested an explicit approval before lasting policy changes and a separate PR
following approval. A rejected or deferred proposal is not approval.

## Operation control

Normal pushes require the tool's approval flow. A prior user authorization still
applies within its stated scope; do not ask again merely to restate it. Force pushes
and remote deletions always require operation-specific approval. Do not obfuscate
commands using aliases, scripts, alternate Git executables, interactive shells,
MCP, HTTP APIs or environment changes to bypass a gate.

The local guards cover recognizable Bash commands, not every possible program.
For enterprise enforcement, use organization-managed tool policy and remote branch
protections with appropriately restricted credentials. Repo-owned files alone are
not an unmodifiable security boundary. See [setup and coverage](README.md).
