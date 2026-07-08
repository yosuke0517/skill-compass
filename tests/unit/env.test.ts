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
    });

    expect(env.LLM_PROVIDER).toBe("deterministic");
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
});
