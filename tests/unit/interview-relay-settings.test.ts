// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { relaySettings } from "@/lib/interview/relay-runtime";
afterEach(() => vi.unstubAllEnvs());
describe("explicit Cloudflare interview transport", () => {
  it("derives the same-origin audio endpoint without needing Google callback identity or an API key", () => {
    vi.stubEnv("INTERVIEW_RELAY_TRANSPORT", "cloudflare");
    vi.stubEnv("INTERVIEW_RELAY_MODE", "openai");
    vi.stubEnv("PUBLIC_APP_URL", "https://app.example");
    vi.stubEnv("INTERVIEW_RELAY_URL", "");
    vi.stubEnv("INTERVIEW_RELAY_AUDIENCE", "");
    vi.stubEnv("INTERVIEW_RELAY_SUBJECT", "");
    expect(relaySettings()).toMatchObject({ transport: "cloudflare", mode: "openai", url: "wss://app.example/api/interview/audio" });
    expect(JSON.stringify(relaySettings())).not.toContain("OPENAI_API_KEY");
  });
  it("rejects a non-OpenAI Cloudflare mode and untrusted configured public URLs", () => {
    vi.stubEnv("INTERVIEW_RELAY_TRANSPORT", "cloudflare");
    vi.stubEnv("INTERVIEW_RELAY_MODE", "google");
    vi.stubEnv("PUBLIC_APP_URL", "https://app.example");
    expect(() => relaySettings()).toThrow();
    vi.stubEnv("INTERVIEW_RELAY_MODE", "openai");
    for (const url of ["http://app.example", "https://user:password@app.example", "https://app.example/path", "https://app.example?x=1", "https://app.example/#x"]) {
      vi.stubEnv("PUBLIC_APP_URL", url);
      expect(() => relaySettings()).toThrow();
    }
  });
});
