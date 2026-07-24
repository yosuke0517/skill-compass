import { describe, expect, it } from "vitest";

import {
  answerTechnicalInterviewQuestion,
  explainSecurityAndPrivacy,
  getArchitectureOverview,
} from "@/lib/mcp/architecture/answers";
import { architectureManifest } from "@/lib/mcp/architecture/manifest";

describe("Architecture MCP answer builders", () => {
  it("returns an allowlisted Japanese architecture overview", () => {
    const overview = getArchitectureOverview({
      manifest: architectureManifest,
      focus: "system",
      latestUserMessage: "構成を説明して",
    });

    expect(overview.responseLanguage).toBe("ja");
    expect(Object.keys(overview).sort()).toEqual([
      "components",
      "currentArchitecture",
      "currentTradeoffs",
      "focus",
      "productSummary",
      "responseLanguage",
    ]);
    expect(
      overview.currentTradeoffs.every((claim) => claim.status !== "planned"),
    ).toBe(true);
  });

  it("separates implemented controls, residual risks, and planned work", () => {
    const security = explainSecurityAndPrivacy({
      manifest: architectureManifest,
      topic: "mcp",
      latestUserMessage: "Can MCP read my secrets?",
    });

    expect(security.responseLanguage).toBe("en");
    expect(security.controls.every((claim) => claim.status !== "planned")).toBe(
      true,
    );
    expect(
      security.plannedImprovements.every(
        (claim) => claim.status === "planned",
      ),
    ).toBe(true);
    expect(security.residualRisks).toContain(
      "Human review and safety tests reduce, but cannot eliminate, the risk of sensitive text being added to the manifest later.",
    );
  });

  it("builds a grounded interview answer without leaking manifest internals", () => {
    const answer = answerTechnicalInterviewQuestion({
      manifest: architectureManifest,
      question: "How did you secure the MCP and protect PII?",
      depth: "standard",
      latestUserMessage: "How did you secure it?",
    });

    expect(answer.currentFacts.length).toBeGreaterThan(0);
    expect(answer.currentFacts.every((claim) => claim.status !== "planned")).toBe(
      true,
    );
    expect(
      answer.plannedImprovements.every(
        (claim) => claim.status === "planned",
      ),
    ).toBe(true);
    expect(answer.currentFacts.map((claim) => claim.id)).toContain(
      "architecture-capability-isolation",
    );
    expect(JSON.stringify(answer)).not.toContain("productSummary");
  });

  it("uses deterministic limits for each interview depth", () => {
    const makeAnswer = (depth: "brief" | "standard" | "deep_dive") =>
      answerTechnicalInterviewQuestion({
        manifest: architectureManifest,
        question: "Explain architecture, MCP, security, and deployment.",
        depth,
      });

    expect(makeAnswer("brief").currentFacts.length).toBeLessThanOrEqual(2);
    expect(makeAnswer("brief").plannedImprovements.length).toBeLessThanOrEqual(
      1,
    );
    expect(makeAnswer("standard").currentFacts.length).toBeLessThanOrEqual(5);
    expect(
      makeAnswer("standard").plannedImprovements.length,
    ).toBeLessThanOrEqual(2);
    expect(makeAnswer("deep_dive").currentFacts.length).toBeGreaterThanOrEqual(
      makeAnswer("standard").currentFacts.length,
    );
  });
});
