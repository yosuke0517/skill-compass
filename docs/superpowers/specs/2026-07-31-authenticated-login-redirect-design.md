# Authenticated Login Redirect Design

## Goal

When an authenticated user opens a saved `/login` bookmark, send them directly
to `/dashboard`. Unauthenticated and expired sessions must continue to see the
login form.

## Design

The `/login` Server Component will call the existing `getSession()` helper
before rendering. When `session.authenticated` is true, it will call Next.js
`redirect("/dashboard")`. Otherwise it will render the existing login page
unchanged.

This keeps `src/proxy.ts` responsible only for protecting private routes. It
also performs the redirect on the server, so the login form never flashes for
an authenticated user.

## Error and Security Behavior

- A missing, malformed, or expired session cookie is treated as unauthenticated.
- Session verification continues to use the existing signed-token logic.
- No redirect target is accepted from user input, so this change introduces no
  open-redirect path.

## Verification

- Add a test proving an authenticated visit to `/login` redirects to
  `/dashboard`.
- Preserve tests proving an unauthenticated visit renders the form and invalid
  credentials remain on `/login?error=invalid`.
- Run focused authentication tests, the unit/integration suite, type checking,
  lint, and the production build.

