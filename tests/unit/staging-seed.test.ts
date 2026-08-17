import { describe, expect, it } from "vitest";

import { buildStagingSeedSql } from "../../scripts/cloudflare/staging-seed";

const input = {
  userId: "user_staging",
  email: "staging-user@skill-compass.invalid",
  passwordHash: "scrypt$test'hash",
  now: new Date("2026-08-17T00:00:00.000Z"),
};

describe("staging D1 seed", () => {
  it("contains the public catalog and one isolated Pro test user", () => {
    const sql = buildStagingSeedSql(input);

    expect(sql).toContain("INSERT INTO `users`");
    expect(sql).toContain("ON CONFLICT (`id`) DO UPDATE SET");
    expect(sql).toContain("staging-user@skill-compass.invalid");
    expect(sql).toContain("INSERT INTO `questions`");
    expect(sql).toContain("INSERT INTO `categories`");
    expect(sql).toContain("'pro'");
    expect(sql).toContain("scrypt$test''hash");
  });

  it("never seeds sessions, OAuth credentials, caches, or personal integrations", () => {
    const sql = buildStagingSeedSql(input);

    expect(sql).not.toMatch(/BEGIN TRANSACTION|COMMIT;/);

    for (const forbiddenTable of [
      "sessions",
      "oauth_connections",
      "mcp_access_tokens",
      "mcp_refresh_tokens",
      "mcp_authorization_codes",
      "x_public_post_cache",
      "x_daily_tech_digest_cache",
    ]) {
      expect(sql).not.toContain(`INTO \`${forbiddenTable}\``);
    }
  });

  it("rejects credentials that are not explicitly staging-only", () => {
    expect(() =>
      buildStagingSeedSql({ ...input, email: "person@example.com" }),
    ).toThrow("staging_email_required");
    expect(() =>
      buildStagingSeedSql({ ...input, userId: "user_local" }),
    ).toThrow("staging_user_id_required");
  });
});
