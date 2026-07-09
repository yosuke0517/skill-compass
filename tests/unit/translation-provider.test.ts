import { describe, expect, it } from "vitest";
import { createClaudeCliTranslationProvider } from "@/lib/translation/providers/claude-cli-provider";

describe("claude cli translation provider", () => {
  it("passes a glossary-aware prompt to the configured command", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const provider = createClaudeCliTranslationProvider({
      command: "claude",
      timeoutMs: 1000,
      execFile: async (command, args) => {
        calls.push({ command, args });
        return { stdout: "API契約", stderr: "" };
      },
    });

    const result = await provider.translate({
      sourceText: "API contract",
      sourceLocale: "en",
      targetLocale: "ja",
      purpose: "quiz_prompt",
      glossary: [{ source: "API contract", target: "API契約" }],
    });

    expect(result).toEqual({ translatedText: "API契約", provider: "claude_cli" });
    expect(calls[0]?.command).toBe("claude");
    expect(calls[0]?.args).toEqual(["-p", expect.stringContaining("API contract")]);
  });
});
