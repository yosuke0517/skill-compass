import { isCloudflareWorkersRuntime } from "@/lib/runtime/cloudflare";
import type { TranslationProvider } from "../types";

type ExecFile = (command: string, args: string[], options: { timeout: number }) => Promise<{ stdout: string; stderr: string }>;

export function createClaudeCliTranslationProvider(options: {
  command: string;
  timeoutMs: number;
  execFile?: ExecFile;
}): TranslationProvider {
  return {
    cacheScope: `claude_cli:${options.command}`,
    async translate(input) {
      if (isCloudflareWorkersRuntime()) {
        return {
          unavailable: true,
          provider: "claude_cli",
          reason: "Claude CLI is unavailable in the Cloudflare Workers runtime.",
        };
      }

      const prompt = buildPrompt(input);

      try {
        const execFile = options.execFile ?? await getNodeExecFile();
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

async function getNodeExecFile(): Promise<ExecFile> {
  const [{ execFile }, { promisify }] = await Promise.all([
    import("node:child_process"),
    import("node:util"),
  ]);
  return promisify(execFile) as ExecFile;
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
