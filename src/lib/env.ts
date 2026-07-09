import { z } from "zod";

const envSchema = z
  .object({
    DATABASE_URL: z.string().url(),
    SKILL_COMPASS_PASSWORD: z.string().optional(),
    SKILL_COMPASS_PASSWORD_SOURCE: z.enum(["env", "keychain"]).default("env"),
    SKILL_COMPASS_PASSWORD_KEYCHAIN_SERVICE: z.string().optional(),
    SKILL_COMPASS_PASSWORD_KEYCHAIN_ACCOUNT: z.string().optional(),
    SESSION_SECRET: z.string().min(32),
    MARKDOWN_EXPORT_DIR: z.string().default("./exports/skill-compass"),
    LLM_PROVIDER: z.enum(["deterministic"]).default("deterministic"),
    ASSISTANT_PROVIDER: z.enum(["deterministic", "gemini"]).default("deterministic"),
    NOTE_WRITER: z.enum(["filesystem"]).default("filesystem"),
    TRANSLATION_PROVIDER: z
      .enum(["deterministic", "disabled", "claude_cli", "gemini"])
      .default("deterministic"),
    CLAUDE_CLI_COMMAND: z.string().min(1).default("claude"),
    CLAUDE_CLI_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
    GEMINI_API_KEY: z.string().optional(),
    GEMINI_API_KEY_SOURCE: z.enum(["env", "keychain"]).default("env"),
    GEMINI_KEYCHAIN_SERVICE: z.string().optional(),
    GEMINI_KEYCHAIN_ACCOUNT: z.string().optional(),
    GEMINI_TRANSLATION_MODEL: z.string().min(1).default("gemini-2.5-flash-lite"),
    GEMINI_ASSISTANT_MODEL: z.string().min(1).default("gemini-2.5-flash-lite"),
  })
  .superRefine((env, ctx) => {
    if (env.SKILL_COMPASS_PASSWORD_SOURCE === "env" && !env.SKILL_COMPASS_PASSWORD) {
      ctx.addIssue({
        code: "custom",
        path: ["SKILL_COMPASS_PASSWORD"],
        message: "SKILL_COMPASS_PASSWORD is required when SKILL_COMPASS_PASSWORD_SOURCE=env.",
      });
    }

    if (
      env.SKILL_COMPASS_PASSWORD_SOURCE === "keychain" &&
      !env.SKILL_COMPASS_PASSWORD_KEYCHAIN_SERVICE
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["SKILL_COMPASS_PASSWORD_KEYCHAIN_SERVICE"],
        message:
          "SKILL_COMPASS_PASSWORD_KEYCHAIN_SERVICE is required when SKILL_COMPASS_PASSWORD_SOURCE=keychain.",
      });
    }
  });

export type AppEnv = z.infer<typeof envSchema>;

let cachedEnv: AppEnv | undefined;

export function parseEnv(input: Record<string, string | undefined>): AppEnv {
  return envSchema.parse(input);
}

export function getEnv(): AppEnv {
  cachedEnv ??= parseEnv(process.env);
  return cachedEnv;
}
