import type { AppEnv } from "@/lib/env";
import { getEnv } from "@/lib/env";

export type SettingsData = {
  providers: Array<{ label: string; value: string }>;
  exportDir: string;
  sessionPolicy: string;
  translationCommand: string;
};

export async function getSettingsData(): Promise<SettingsData> {
  return buildSettingsData(getEnv());
}

export function buildSettingsData(env: Pick<AppEnv, "MARKDOWN_EXPORT_DIR" | "LLM_PROVIDER" | "NOTE_WRITER" | "TRANSLATION_PROVIDER" | "CLAUDE_CLI_COMMAND" | "CLAUDE_CLI_TIMEOUT_MS">): SettingsData {
  return {
    providers: [
      { label: "LLM", value: env.LLM_PROVIDER },
      { label: "Translation", value: env.TRANSLATION_PROVIDER },
      { label: "Notes", value: env.NOTE_WRITER },
    ],
    exportDir: env.MARKDOWN_EXPORT_DIR,
    sessionPolicy: "Fixed password, signed 24 hour session",
    translationCommand: env.CLAUDE_CLI_COMMAND,
  };
}
