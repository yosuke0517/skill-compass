import { z } from "zod";

const envSchema = z
  .object({
    DATABASE_URL: z.string().url(),
    SESSION_SECRET: z.string().min(32),
    MARKDOWN_EXPORT_DIR: z.string().default("./exports/skill-compass"),
    LLM_PROVIDER: z.enum(["deterministic"]).default("deterministic"),
    QUIZ_GENERATION_PROVIDER: z.enum(["deterministic", "gemini"]).default("deterministic"),
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
    GEMINI_QUIZ_MODEL: z.string().min(1).default("gemini-2.5-flash-lite"),
    GEMINI_SCRIPT_MODEL: z.string().min(1).default("gemini-2.5-flash-lite"),
    GEMINI_ASSISTANT_MODEL: z.string().min(1).default("gemini-2.5-flash-lite"),
    GEMINI_TTS_MODEL: z.string().min(1).default("gemini-2.5-flash-preview-tts"),
    PODCAST_AUDIO_STORAGE: z.enum(["filesystem", "r2"]).default("filesystem"),
    PODCAST_AUDIO_STORAGE_DIR: z.string().default("./var/skill-compass-audio"),
    PODCAST_R2_ACCOUNT_ID: z.string().optional(),
    PODCAST_R2_BUCKET_NAME: z.string().optional(),
    PODCAST_R2_ACCESS_KEY_ID: z.string().optional(),
    PODCAST_R2_SECRET_ACCESS_KEY: z.string().optional(),
    PODCAST_R2_CREDENTIALS_SOURCE: z.enum(["env", "keychain"]).default("env"),
    PODCAST_R2_ACCESS_KEY_KEYCHAIN_SERVICE: z.string().default("skill-compass/podcast-r2-access-key"),
    PODCAST_R2_SECRET_KEY_KEYCHAIN_SERVICE: z.string().default("skill-compass/podcast-r2-secret-key"),
    PODCAST_R2_KEYCHAIN_ACCOUNT: z.string().optional(),
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
