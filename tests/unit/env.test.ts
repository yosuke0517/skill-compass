import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

describe("parseEnv", () => {
  it("accepts public-safe local configuration", () => {
    const env = parseEnv({
      DATABASE_URL: "mysql://skill_compass:skill_compass@127.0.0.1:3306/skill_compass",
      SESSION_SECRET: "12345678901234567890123456789012",
      MARKDOWN_EXPORT_DIR: "./exports/skill-compass",
      LLM_PROVIDER: "deterministic",
      ASSISTANT_PROVIDER: "gemini",
      NOTE_WRITER: "filesystem",
      TRANSLATION_PROVIDER: "deterministic",
      CLAUDE_CLI_COMMAND: "claude",
      CLAUDE_CLI_TIMEOUT_MS: "10000",
    });

    expect(env.LLM_PROVIDER).toBe("deterministic");
    expect(env.ASSISTANT_PROVIDER).toBe("gemini");
    expect(env.TRANSLATION_PROVIDER).toBe("deterministic");
    expect(env.CLAUDE_CLI_COMMAND).toBe("claude");
    expect(env.CLAUDE_CLI_TIMEOUT_MS).toBe(10000);
  });

  it("accepts Gemini translation configuration without requiring a committed key", () => {
    const env = parseEnv({
      DATABASE_URL: "mysql://skill_compass:skill_compass@127.0.0.1:3306/skill_compass",
      SESSION_SECRET: "12345678901234567890123456789012",
      TRANSLATION_PROVIDER: "gemini",
      ASSISTANT_PROVIDER: "gemini",
      GEMINI_API_KEY_SOURCE: "keychain",
      GEMINI_KEYCHAIN_SERVICE: "local-gemini-api-key",
      GEMINI_KEYCHAIN_ACCOUNT: "local-user",
      GEMINI_TRANSLATION_MODEL: "gemini-2.5-flash-lite",
      GEMINI_ASSISTANT_MODEL: "gemini-2.5-flash-lite",
    });

    expect(env.TRANSLATION_PROVIDER).toBe("gemini");
    expect(env.GEMINI_API_KEY_SOURCE).toBe("keychain");
    expect(env.GEMINI_KEYCHAIN_SERVICE).toBe("local-gemini-api-key");
    expect(env.GEMINI_KEYCHAIN_ACCOUNT).toBe("local-user");
    expect(env.GEMINI_TRANSLATION_MODEL).toBe("gemini-2.5-flash-lite");
    expect(env.GEMINI_ASSISTANT_MODEL).toBe("gemini-2.5-flash-lite");
  });

  it("rejects a short session secret", () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: "mysql://skill_compass:skill_compass@127.0.0.1:3306/skill_compass",
        SESSION_SECRET: "short",
      }),
    ).toThrow(/SESSION_SECRET/);
  });

  it("rejects an unknown translation provider", () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: "mysql://skill_compass:skill_compass@127.0.0.1:3306/skill_compass",
        SESSION_SECRET: "12345678901234567890123456789012",
        TRANSLATION_PROVIDER: "remote-secret-provider",
      }),
    ).toThrow(/TRANSLATION_PROVIDER/);
  });
});
