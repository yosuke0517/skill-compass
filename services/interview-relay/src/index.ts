import { readFileSync } from "node:fs";
import { relayServer } from "./server.js";
import { WorkerAuthority, googleTokens, localTokens } from "./authority.js";
import { MockHints, VertexHints } from "./adapters/hints.js";
import { GoogleSpeech } from "./adapters/speech.js";
import { RotatingSpeech } from "./adapters/rotating.js";
import { MockSpeech } from "./adapters/mock-speech.js";
import { OpenAIHints } from "./adapters/openai-hints.js";
import { OpenAISpeech } from "./adapters/openai-speech.js";
import type { HintAdapter } from "./shared.js";
const mode = process.env.INTERVIEW_RELAY_MODE ?? "mock";
if (mode !== "mock" && mode !== "google" && mode !== "openai") throw new Error("Invalid mode");
const audience = process.env.INTERVIEW_RELAY_AUDIENCE ?? "";
const origin = process.env.INTERVIEW_BROWSER_ORIGIN ?? "";
const url = new URL(audience),
  browser = new URL(origin);
if (
  url.search ||
  url.hash ||
  url.username ||
  url.password ||
  !url.pathname.endsWith("/api/interview/relay/redeem") ||
  browser.origin !== origin
)
  throw new Error("Invalid endpoints");
if (
  mode === "mock" &&
  (process.env.NODE_ENV === "production" ||
    url.hostname !== "127.0.0.1" ||
    browser.hostname !== "127.0.0.1")
)
  throw new Error("Mock is loopback-only");
if (
  mode === "google" &&
  (process.env.INTERVIEW_GOOGLE_ENABLED !== "1" ||
    url.protocol !== "https:" ||
    browser.protocol !== "https:")
)
  throw new Error("Explicit Google enablement required");
if (mode === "openai" && (process.env.INTERVIEW_OPENAI_ENABLED !== "1" ||
    !process.env.OPENAI_API_KEY?.trim() || url.protocol !== "https:" || browser.protocol !== "https:"))
  throw new Error("Explicit OpenAI enablement and server API key required");
const token =
  mode !== "mock"
    ? googleTokens(audience)
    : localTokens(
        audience,
        process.env.INTERVIEW_RELAY_SUBJECT ?? "",
        readFileSync(process.env.INTERVIEW_LOCAL_KEY_FILE ?? "", "utf8"),
      );
const mockSpeech = new MockSpeech();
let speech: RotatingSpeech | undefined;
let hints: HintAdapter | undefined;
const server = relayServer({
  mode,
  origin,
  authority: new WorkerAuthority(audience, token),
  providers: () =>
    mode === "mock"
      ? { speech: mockSpeech, hints: new MockHints() }
      : mode === "openai" ? {
          speech: (speech ??= new RotatingSpeech(new OpenAISpeech(process.env.OPENAI_API_KEY!))),
          hints: (hints ??= new OpenAIHints(process.env.OPENAI_API_KEY!, process.env.INTERVIEW_OPENAI_HINT_MODEL ?? "gpt-4.1-mini")),
        }
      : {
          speech: (speech ??= new RotatingSpeech(
            new GoogleSpeech(process.env.GOOGLE_CLOUD_PROJECT ?? "", "us", "chirp_3"),
          )),
          hints: (hints ??= new VertexHints(
            process.env.GOOGLE_CLOUD_PROJECT ?? "",
            process.env.INTERVIEW_GEMINI_MODEL ?? "gemini-3.1-flash-lite",
          )),
        },
});
const port = Number(process.env.PORT ?? 4318);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid port");
server.http.listen(port, mode === "mock" ? "127.0.0.1" : "0.0.0.0", () =>
  console.log(`Interview relay ready (${mode})`),
);
for (const name of ["SIGTERM", "SIGINT"] as const)
  process.on(name, () => {
    void server.close().finally(() => process.exit(0));
  });
