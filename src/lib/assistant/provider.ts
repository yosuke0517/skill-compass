import { getEnv } from "@/lib/env";
import { createKeychainApiKeyResolver } from "@/lib/translation/providers/gemini-provider";
import { deterministicAssistantProvider } from "./providers/deterministic-assistant-provider";
import { createGeminiAssistantProvider } from "./providers/gemini-assistant-provider";
import type { AssistantProvider } from "./types";

export function getAssistantProvider(): AssistantProvider {
  const env = getEnv();

  switch (env.ASSISTANT_PROVIDER) {
    case "gemini":
      return createGeminiAssistantProvider({
        apiKey:
          env.GEMINI_API_KEY_SOURCE === "keychain" && env.GEMINI_KEYCHAIN_SERVICE
            ? createKeychainApiKeyResolver({
                service: env.GEMINI_KEYCHAIN_SERVICE,
                account: env.GEMINI_KEYCHAIN_ACCOUNT,
              })
            : env.GEMINI_API_KEY,
        model: env.GEMINI_ASSISTANT_MODEL,
      });
    case "deterministic":
      return deterministicAssistantProvider;
  }
}
