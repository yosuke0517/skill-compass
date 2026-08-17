# MySQL to D1 cutover

This runbook keeps MySQL authoritative until a separately approved production cutover. MySQL and D1 are never dual-written.

## Safety properties

- The export contains all 36 application tables in stable primary-key order.
- The artifact is encrypted with scrypt-derived AES-256-GCM and must be stored with mode `0600`.
- Password hashes, OAuth ciphertext, sessions, MCP token hashes, and personal rows are never printed.
- D1 imports use explicit columns and primary keys, bounded batches, and idempotent `ON CONFLICT DO UPDATE/DO NOTHING` statements that do not delete referenced parent rows.
- Verification compares table counts and deterministic row checksums, which covers primary keys, foreign-key values, Today history, OAuth families, ciphertext bytes, Podcast chats, and R2 storage keys without logging those values.

## Staging rehearsal

1. Use a disposable fixture or an explicitly anonymized copy. Do not export production rows for a routine staging test.
2. Put a random migration passphrase in macOS Keychain or a protected CI secret. Never pass it as a command-line argument.
3. Export to a temporary encrypted file with `DATABASE_URL`, `MIGRATION_PASSPHRASE`, and `tsx scripts/migration/export-mysql.ts <artifact>`.
4. Import only into the confirmed staging D1 database with the Cloudflare account, database ID, token, and passphrase supplied as environment secrets.
5. Run `tsx scripts/migration/verify-migration.ts <artifact>`.
6. Repeat the import and verification. Both reports must be identical and successful.
7. Delete the encrypted rehearsal artifact after verification and record only counts, commit SHA, and pass/fail evidence.

## Production approval checkpoint

Before touching production rows, present the exact source, destination D1 ID, backup path, expected counts, maintenance window, and rollback owner. Do not proceed without explicit approval.

## Production sequence

1. Back up MySQL and verify the backup can be opened.
2. Enable application maintenance/read-only mode on the Mac origin.
3. Wait for active writes to drain and capture final table counts.
4. Create one final encrypted export and retain it only for the approved rollback period.
5. Import to production D1 and run verification. Any mismatch stops the cutover.
6. Verify R2 keys referenced by Podcast assets exist; never copy secrets into Terraform state.
7. Deploy the exact staging-verified commit, then switch traffic manually.
8. Run login, Today read/write, history, OAuth, MCP, X lookup, and Podcast playback checks.
9. Keep MySQL read-only for rollback. Do not resume writes on both databases.

## Rollback and retention

- Before DNS/route switching: discard the D1 import and leave the Mac origin authoritative.
- After switching: route traffic back to the read-only Mac snapshot only if no D1-only writes must be preserved; otherwise stop and reconcile explicitly.
- Delete local encrypted artifacts at the end of the approved retention window. Revoking the Cloudflare API token does not delete artifacts.
