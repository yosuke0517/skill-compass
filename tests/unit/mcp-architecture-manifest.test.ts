import { describe, expect, it } from "vitest";

import { architectureManifest } from "@/lib/mcp/architecture/manifest";
import { validateArchitectureManifest } from "@/lib/mcp/architecture/manifest-validator";
import type { ArchitectureManifest } from "@/lib/mcp/architecture/types";

describe("Architecture MCP public-safe manifest", () => {
  it("accepts the reviewed Skill Compass manifest", () => {
    expect(() => validateArchitectureManifest(architectureManifest)).not.toThrow();
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
