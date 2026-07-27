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

  it("contains no live lesson copy or account and deployment identifiers", () => {
    const serialized = JSON.stringify(architectureManifest);

    for (const question of reviewedQuestionBank) {
      expect(serialized).not.toContain(question.scenario);
      expect(serialized).not.toContain(question.prompt);
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
