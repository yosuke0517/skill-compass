import { getEnv } from "@/lib/env";
import { createClaudeCliTranslationProvider } from "./providers/claude-cli-provider";
import { deterministicTranslationProvider } from "./providers/deterministic-provider";
import { disabledTranslationProvider } from "./providers/disabled-provider";
import type { TranslationProvider } from "./types";

export function getTranslationProvider(): TranslationProvider {
  const env = getEnv();

  switch (env.TRANSLATION_PROVIDER) {
    case "claude_cli":
      return createClaudeCliTranslationProvider({
        command: env.CLAUDE_CLI_COMMAND,
        timeoutMs: env.CLAUDE_CLI_TIMEOUT_MS,
      });
    case "disabled":
      return disabledTranslationProvider;
    case "deterministic":
      return deterministicTranslationProvider;
  }
}
