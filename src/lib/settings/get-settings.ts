import type { AppEnv } from "@/lib/env";
import { getEnv } from "@/lib/env";

export type SettingsData = {
  providers: Array<{ label: string; value: string }>;
  exportDir: string;
  sessionPolicy: string;
  translationRuntime: { label: string; value: string };
};

export async function getSettingsData(): Promise<SettingsData> {
  return buildSettingsData(getEnv());
}

export function buildSettingsData(env: Pick<AppEnv, "MARKDOWN_EXPORT_DIR" | "LLM_PROVIDER" | "ASSISTANT_PROVIDER" | "NOTE_WRITER" | "TRANSLATION_PROVIDER" | "CLAUDE_CLI_COMMAND" | "CLAUDE_CLI_TIMEOUT_MS" | "GEMINI_TRANSLATION_MODEL" | "GEMINI_ASSISTANT_MODEL">): SettingsData {
  return {
    providers: [
      { label: "LLM", value: env.LLM_PROVIDER },
      { label: "Assistant", value: env.ASSISTANT_PROVIDER },
      { label: "Translation", value: env.TRANSLATION_PROVIDER },
      { label: "Notes", value: env.NOTE_WRITER },
    ],
    exportDir: env.MARKDOWN_EXPORT_DIR,
    sessionPolicy: "Fixed password, signed 24 hour session",
    translationRuntime:
      env.TRANSLATION_PROVIDER === "gemini"
        ? { label: "Gemini model", value: env.GEMINI_TRANSLATION_MODEL }
        : { label: "Claude CLI", value: env.CLAUDE_CLI_COMMAND },
  };
}
