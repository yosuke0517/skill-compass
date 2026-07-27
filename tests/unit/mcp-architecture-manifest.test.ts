import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { architectureManifest } from "@/lib/mcp/architecture/manifest";
import { validateArchitectureManifest } from "@/lib/mcp/architecture/manifest-validator";
import type { ArchitectureManifest } from "@/lib/mcp/architecture/types";
import { reviewedQuestionBank } from "@/lib/quiz/content/question-bank";

describe("Architecture MCP public-safe manifest", () => {
  it("accepts the reviewed Skill Compass manifest", () => {
    expect(() => validateArchitectureManifest(architectureManifest)).not.toThrow();
  });

  it("describes shared lessons and user-owned state instead of singleton storage", () => {
    const serialized = JSON.stringify(architectureManifest).toLowerCase();

    expect(serialized).toContain("shared reviewed lesson content");
    expect(serialized).toContain("user-scoped learning state");
    expect(serialized).not.toContain("singleton today storage");
    expect(serialized).not.toContain("user_local");
  });

  it("marks practical learning as current and diagnostic and cloud work as planned", () => {
    const statusById = Object.fromEntries(
      architectureManifest.claims.map((claim) => [claim.id, claim.status]),
    );

    expect(statusById["practical-today"]).toBe("implemented");
    expect(statusById["diagnostic-exam"]).toBe("planned");
    expect(statusById["hosted-runtime"]).toBe("planned");
  });

  it("documents X news as personalized-trend-guided public search only", () => {
    const claim = architectureManifest.claims.find(
      (item) => item.id === "x-technical-news",
    );
    const showcase = readFileSync(
      join(
        process.cwd(),
        "docs/showcase/skill-compass-architecture.html",
      ),
      "utf8",
    );
    const runbook = readFileSync(
      join(process.cwd(), "docs/runbooks/chatgpt-mcp.md"),
      "utf8",
    );

    expect(claim?.statement).toContain("personalized technical trends");
    expect(claim?.statement).toContain("recent public X search");
    expect(JSON.stringify(claim)).not.toContain("following timeline");
    expect(showcase).toContain("Personalized Trends");
    expect(showcase).not.toContain("following timeline");
    expect(runbook).toContain("public-search candidates");
    expect(runbook).not.toContain("following timeline");
    expect(runbook).not.toContain("following-timeline");
  });

  it("distinguishes static answer capabilities from database-backed HTTP authentication", () => {
    const answerTools = architectureManifest.claims.find(
      (claim) => claim.id === "architecture-capability-isolation",
    );
    const httpAuthentication = architectureManifest.claims.find(
      (claim) => claim.id === "architecture-http-authentication",
    );

    expect(answerTools?.statement).toContain("answer tools");
    expect(answerTools?.statement).toContain(
      "cannot query learning state or user records",
    );
    expect(answerTools?.statement).not.toContain("no database");
    expect(httpAuthentication?.statement).toContain(
      "HTTP authentication boundary",
    );
    expect(httpAuthentication?.statement).toContain(
      "OAuth token and current-user records",
    );
  });

  it("contains no reviewed instructional content or account and deployment identifiers", () => {
    const serialized = JSON.stringify(architectureManifest);

    for (const question of reviewedQuestionBank) {
      const instructionalContent = [
        question.scenario,
        question.prompt,
        question.rationale,
        question.checkQuestion,
        ...question.decisionCriteria,
        ...question.practicalNotes,
        ...question.artifacts.flatMap((artifact) => [
          artifact.title,
          artifact.content,
        ]),
        ...question.choices.flatMap((choice) => [
          choice.label,
          choice.explanation,
          choice.consequence,
        ]),
      ];
      for (const content of instructionalContent) {
        expect(serialized).not.toContain(content);
      }
    }
    expect(serialized).not.toMatch(/\bq_[a-z0-9_]+\b/i);
    expect(serialized).not.toMatch(/\buser_local\b/i);
    expect(serialized).not.toMatch(/https?:\/\//i);
    expect(serialized).not.toMatch(/\/(?:Users|home|private)\//);
  });

  it("links both READMEs to the whole-product showcase", () => {
    const rootReadme = readFileSync(join(process.cwd(), "README.md"), "utf8");
    const docsReadme = readFileSync(
      join(process.cwd(), "docs/README.md"),
      "utf8",
    );
    const liteDesign = readFileSync(
      join(process.cwd(), "docs/specs/skill-compass-lite-design.md"),
      "utf8",
    );
    const showcasePath = join(
      process.cwd(),
      "docs/showcase/skill-compass-architecture.html",
    );

    expect(existsSync(showcasePath)).toBe(true);
    expect(rootReadme).toContain(
      "docs/showcase/skill-compass-architecture.html",
    );
    expect(docsReadme).toContain("showcase/skill-compass-architecture.html");
    expect(liteDesign).toContain("../showcase/skill-compass-architecture.html");
    expect(`${rootReadme}\n${docsReadme}\n${liteDesign}`).not.toContain(
      "showcase/podcast-studio.html",
    );
  });

  it("keeps every showcase navigation link accessible at 320px without masking overflow", () => {
    const showcase = readFileSync(
      join(
        process.cwd(),
        "docs/showcase/skill-compass-architecture.html",
      ),
      "utf8",
    );

    expect(showcase).not.toMatch(
      /body\s*\{[^}]*overflow-x\s*:\s*hidden[^}]*\}/s,
    );
    expect(showcase).not.toMatch(
      /\.toplinks a\s*\{\s*display\s*:\s*none\s*;\s*\}/s,
    );
    expect(showcase).toMatch(
      /@media \(max-width: 700px\)[\s\S]*?\.topbar-inner\s*\{[^}]*flex-direction\s*:\s*column/s,
    );
    for (const target of [
      "#origin",
      "#learning",
      "#system",
      "#security",
      "#future",
    ]) {
      expect(showcase).toContain(`href="${target}"`);
    }
  });

  it.each([
    "owner@example.com",
    "/Users/example/project/.env",
    "C:\\Users\\example\\secret.txt",
    "https://private.example.net/mcp",
    "Authorization: Bearer abc123",
    "PRIVATE_KEY=secret",
  ])("rejects disclosure-shaped content: %s", (unsafeText) => {
    const manifest: ArchitectureManifest = {
      ...architectureManifest,
      productSummary: unsafeText,
    };
    expect(() => validateArchitectureManifest(manifest)).toThrow(
      "unsafe_architecture_manifest",
    );
  });

  it("rejects an unsupported claim status at runtime", () => {
    const manifest = structuredClone(architectureManifest) as unknown as {
      claims: Array<Record<string, unknown>>;
    };
    manifest.claims[0].status = "maybe";
    expect(() =>
      validateArchitectureManifest(manifest as unknown as ArchitectureManifest),
    ).toThrow("invalid_architecture_manifest");
  });
});
