# Database User Authentication Design

## Goal

Replace the MVP fixed-password login with database-backed user authentication that is safe to publish in a public repository and can grow into invite-only registration.

## Decisions

- Store users in MySQL, not in environment variables.
- Store password hashes, not encrypted or plaintext passwords.
- Use salted `scrypt` hashes via Node.js `crypto` to avoid adding a native password-hashing dependency for the lite MVP.
- Keep the existing 24 hour signed session cookie, but include user identity claims for future account-aware features.
- Add invite-ready database tables now, while leaving invite acceptance UI/API for a later task.

## Data Model

- `users`
  - `id`
  - `email`
  - `display_name`
  - `password_hash`
  - `status`
  - timestamps
- `invites`
  - `id`
  - `email`
  - `token_hash`
  - `invited_by_user_id`
  - `expires_at`
  - `used_at`
  - timestamp

## Login Flow

1. The login form submits `email` and `password`.
2. The server normalizes the email and loads an active user from the database.
3. The submitted password is verified against `users.password_hash`.
4. On success, the app sets the existing signed 24 hour session cookie.
5. On failure, the login page shows a generic error so it does not reveal whether the email exists.

## Public Repo Safety

The repository may contain schema, hashing code, tests, and a public-safe local seed account. It must not contain real passwords, private user emails, invite tokens, API keys, operational domains, or local machine details.

## Later Work

- Invite creation and acceptance flows.
- Password reset or rotation flow.
- User-aware ownership for quiz progress and settings.
