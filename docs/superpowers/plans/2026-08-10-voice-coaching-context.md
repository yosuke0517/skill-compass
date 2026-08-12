# Voice Coaching Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the scheduled Today lesson a compact, user-scoped coaching summary while keeping Voice answer synchronization valid when confidence is omitted.

**Architecture:** `get_today` will load the authenticated learner's existing skill aggregates and project a bounded `coachingContext` alongside the five-question instructor pack. The projection exposes only named learning aggregates and guidance, never arbitrary profile data or another user's state. Two reusable scheduled-task prompts will keep X news and Today in separate chats.

**Tech Stack:** TypeScript, Vitest, Drizzle-backed skill aggregates, MCP SDK.

## Global Constraints

- Confidence remains optional and does not affect scoring.
- Self-assessment versus measured-skill gaps remain available.
- The coaching payload must be bounded and user-scoped.
- Existing unrelated working-tree changes must not be modified.

---

### Task 1: Bounded Today coaching context

**Files:**
- Modify: `src/lib/quiz/today-service.ts`
- Test: `tests/unit/today-service.test.ts`

**Interfaces:**
- Consumes: `getSkillsData(userId): Promise<SkillsData>`
- Produces: `McpTodayResult.coachingContext`

- [ ] Add a failing unit test for strengths, focus areas, self-assessment gaps, limits, and user-scoped loading.
- [ ] Run the focused test and confirm the missing field causes the failure.
- [ ] Implement the minimal bounded projection and default skill-data loader.
- [ ] Run the focused unit tests and confirm they pass.

### Task 2: MCP contract and schedule prompts

**Files:**
- Modify: `tests/unit/mcp-tools.test.ts`
- Modify: `src/lib/mcp/server.ts`
- Create: `docs/runbooks/chatgpt-scheduled-voice-prompts.md`

**Interfaces:**
- Consumes: `McpTodayResult.coachingContext`
- Produces: a discoverable MCP description and two copy-ready prompts

- [ ] Add a failing MCP contract assertion for coaching context guidance.
- [ ] Update the `get_today` description and verify the focused MCP test passes.
- [ ] Write separate compact X and Today prompts, with optional confidence synchronization.
- [ ] Run full tests, typecheck, lint, and build.
