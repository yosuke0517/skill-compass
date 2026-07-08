import { getEnv } from "@/lib/env";

import { deterministicLlmProvider } from "./deterministic-provider";
import type { LlmProvider } from "./types";

export function getLlmProvider(): LlmProvider {
  const env = getEnv();

  switch (env.LLM_PROVIDER) {
    case "deterministic":
      return deterministicLlmProvider;
  }
}
