import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  SKILL_COMPASS_PASSWORD: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  MARKDOWN_EXPORT_DIR: z.string().default("./exports/skill-compass"),
  LLM_PROVIDER: z.enum(["deterministic"]).default("deterministic"),
  NOTE_WRITER: z.enum(["filesystem"]).default("filesystem"),
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
