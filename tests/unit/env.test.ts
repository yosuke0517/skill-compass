import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

describe("parseEnv", () => {
  it("accepts public-safe local configuration", () => {
    const env = parseEnv({
      DATABASE_URL: "mysql://skill_compass:skill_compass@127.0.0.1:3306/skill_compass",
      SKILL_COMPASS_PASSWORD: "local-password",
      SESSION_SECRET: "12345678901234567890123456789012",
      MARKDOWN_EXPORT_DIR: "./exports/skill-compass",
      LLM_PROVIDER: "deterministic",
      NOTE_WRITER: "filesystem",
      TRANSLATION_PROVIDER: "deterministic",
      CLAUDE_CLI_COMMAND: "claude",
      CLAUDE_CLI_TIMEOUT_MS: "10000",
    });

    expect(env.LLM_PROVIDER).toBe("deterministic");
    expect(env.TRANSLATION_PROVIDER).toBe("deterministic");
    expect(env.CLAUDE_CLI_COMMAND).toBe("claude");
    expect(env.CLAUDE_CLI_TIMEOUT_MS).toBe(10000);
  });

  it("rejects a short session secret", () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: "mysql://skill_compass:skill_compass@127.0.0.1:3306/skill_compass",
        SKILL_COMPASS_PASSWORD: "local-password",
        SESSION_SECRET: "short",
      }),
    ).toThrow(/SESSION_SECRET/);
  });

  it("rejects an unknown translation provider", () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: "mysql://skill_compass:skill_compass@127.0.0.1:3306/skill_compass",
        SKILL_COMPASS_PASSWORD: "local-password",
        SESSION_SECRET: "12345678901234567890123456789012",
        TRANSLATION_PROVIDER: "remote-secret-provider",
      }),
    ).toThrow(/TRANSLATION_PROVIDER/);
  });
});
