# Authenticated Login Redirect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redirect authenticated `/login` visitors to `/dashboard` without rendering the login form.

**Architecture:** Keep private-route enforcement in `src/proxy.ts`. The login Server Component reads the existing signed session with `getSession()` and uses Next.js `redirect()` only when authenticated.

**Tech Stack:** Next.js App Router, React Server Components, `jose` session tokens, Vitest.

## Global Constraints

- Missing, malformed, and expired cookies continue to render the login form.
- The redirect target is the fixed path `/dashboard`.
- Do not change protected-route matching or login form behavior.

---

### Task 1: Redirect an authenticated login-page request

**Files:**
- Modify: `src/app/(auth)/login/page.tsx`
- Create: `tests/unit/login-page.test.tsx`

**Interfaces:**
- Consumes: `getSession(): Promise<SessionState>` from `src/lib/auth/session.ts`.
- Produces: `LoginPage()` redirects authenticated sessions to `/dashboard` and otherwise returns the existing login markup.

- [ ] **Step 1: Write the failing tests**

Mock `getSession` and Next.js `redirect`. Assert an authenticated session calls
`redirect("/dashboard")`. Assert an unauthenticated session returns the login
form and does not redirect.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node node_modules/vitest/vitest.mjs run tests/unit/login-page.test.tsx
```

Expected: the authenticated case fails because `LoginPage` does not read the
session or redirect.

- [ ] **Step 3: Implement the minimal server-side redirect**

Add the existing session helper and redirect imports, then guard rendering:

```tsx
const session = await getSession();
if (session.authenticated) redirect("/dashboard");
```

- [ ] **Step 4: Verify focused and regression suites**

Run:

```bash
node node_modules/vitest/vitest.mjs run tests/unit/login-page.test.tsx
node node_modules/vitest/vitest.mjs run tests/unit tests/integration
node_modules/.bin/tsc --noEmit
node_modules/.bin/eslint src/app/'(auth)'/login/page.tsx tests/unit/login-page.test.tsx
pnpm build
```

Expected: all checks pass.

- [ ] **Step 5: Commit and deploy**

```bash
git add src/app/'(auth)'/login/page.tsx tests/unit/login-page.test.tsx
git commit -m "fix: redirect authenticated login visits"
git push origin main
pnpm build
launchctl kickstart -k gui/$(id -u)/xyz.finegate.skill-compass-web
```

Verify an authenticated browser visit to `https://agent.finegate.xyz/login`
lands on `/dashboard`, while a logged-out request still renders `/login`.

