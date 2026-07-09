import { execFile as nodeExecFile } from "node:child_process";
import { promisify } from "node:util";
import type { TranslationProvider } from "../types";

const execFileAsync = promisify(nodeExecFile) as ExecFile;

type ExecFile = (command: string, args: string[], options: { timeout: number }) => Promise<{ stdout: string; stderr: string }>;

export function createClaudeCliTranslationProvider(options: {
  command: string;
  timeoutMs: number;
  execFile?: ExecFile;
}): TranslationProvider {
  const execFile = options.execFile ?? execFileAsync;

  return {
    cacheScope: `claude_cli:${options.command}`,
    async translate(input) {
      const prompt = buildPrompt(input);

      try {
        const result = await execFile(options.command, ["-p", prompt], { timeout: options.timeoutMs });
        const translatedText = result.stdout.trim();

        if (!translatedText) {
          return { unavailable: true, provider: "claude_cli", reason: "Claude CLI returned empty output." };
        }

        return { translatedText, provider: "claude_cli" };
      } catch {
        return { unavailable: true, provider: "claude_cli", reason: "Claude CLI translation failed." };
      }
    },
  };
}

function buildPrompt(input: Parameters<TranslationProvider["translate"]>[0]): string {
  const glossary = (input.glossary ?? [])
    .map((entry) => `- ${entry.source} => ${entry.target}`)
    .join("\n");

  return [
    "Translate the following English engineering learning text into natural Japanese.",
    "Translate only the content inside <source_text>.",
    "Return only the translated Japanese text. Do not include tags, labels, purpose, or explanations.",
    "Preserve technical terms according to this glossary:",
    glossary || "- No glossary entries",
    `<purpose>${input.purpose}</purpose>`,
    "<source_text>",
    input.sourceText,
    "</source_text>",
  ].join("\n");
}
