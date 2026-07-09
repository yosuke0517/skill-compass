import { describe, expect, it } from "vitest";
import { createClaudeCliTranslationProvider } from "@/lib/translation/providers/claude-cli-provider";
import { createGeminiTranslationProvider, createKeychainApiKeyResolver } from "@/lib/translation/providers/gemini-provider";

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

describe("gemini translation provider", () => {
  it("posts a glossary-aware translation request to the configured Gemini model", async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    const provider = createGeminiTranslationProvider({
      apiKey: async () => "test-api-key",
      model: "gemini-2.5-flash-lite",
      fetch: async (url, init) => {
        requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
        return new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: "API契約" }] } }],
          }),
          { status: 200 },
        );
      },
    });

    const result = await provider.translate({
      sourceText: "API contract",
      sourceLocale: "en",
      targetLocale: "ja",
      purpose: "quiz_prompt",
      glossary: [{ source: "API contract", target: "API契約" }],
    });

    expect(result).toEqual({ translatedText: "API契約", provider: "gemini" });
    expect(requests[0]?.url).toContain("/models/gemini-2.5-flash-lite:generateContent");
    expect(requests[0]?.url).toContain("key=test-api-key");
    expect(requests[0]?.body).toMatchObject({
      contents: [{ parts: [{ text: expect.stringContaining("API contract => API契約") }] }],
      generationConfig: { temperature: 0.1 },
    });
  });

  it("can resolve a Gemini API key from macOS Keychain", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const resolveApiKey = createKeychainApiKeyResolver({
      service: "local-gemini-api-key",
      account: "local-user",
      execFile: async (command, args) => {
        calls.push({ command, args });
        return { stdout: "secret-from-keychain\n", stderr: "" };
      },
    });

    await expect(resolveApiKey()).resolves.toBe("secret-from-keychain");
    expect(calls).toEqual([
      {
        command: "security",
        args: ["find-generic-password", "-s", "local-gemini-api-key", "-a", "local-user", "-w"],
      },
    ]);
  });
});
