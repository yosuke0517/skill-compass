import { describe, expect, it } from "vitest";

import { getMcpConsent } from "@/lib/mcp/auth/consent";

const resources = {
  learningResourceUrl: "https://example.com/mcp",
  architectureResourceUrl: "https://example.com/mcp/architecture",
};

describe("MCP OAuth consent copy", () => {
  it("describes only read-only technical access for the Architecture resource", () => {
    expect(
      getMcpConsent(
        "https://example.com/mcp/architecture",
        resources,
      ),
    ).toEqual({
      summary:
        "This grants read-only access to reviewed Skill Compass technical architecture and interview guidance.",
      capabilities: [
        "Read reviewed architecture, data-flow, and deployment facts",
        "Explain security, privacy boundaries, tradeoffs, and planned improvements",
        "Prepare grounded technical interview answers",
      ],
    });
  });

  it("keeps the existing learning consent for the learning resource", () => {
    const consent = getMcpConsent("https://example.com/mcp", resources);

    expect(consent?.summary).toContain("Today progress");
    expect(consent?.capabilities).toContain("Read and submit Today answers");
    expect(consent?.capabilities).toContain(
      "Read public X Posts and retrieve a bounded daily technical digest",
    );
    expect(consent?.capabilities).toContain(
      "Temporarily inspect your X following timeline without storing the timeline or followed-account list",
    );
  });

  it("rejects an unknown resource", () => {
    expect(getMcpConsent("https://attacker.example/mcp", resources)).toBeNull();
  });
});
