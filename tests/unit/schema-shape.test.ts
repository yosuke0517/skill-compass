import { describe, expect, it } from "vitest";
import { categories, concepts, conceptTags, sourceTrustTierEnum, tags, translationCache } from "@/db/schema";

describe("schema", () => {
  it("supports many-to-many concepts and tags", () => {
    expect(conceptTags).toBeDefined();
    expect(categories).toBeDefined();
    expect(tags).toBeDefined();
    expect(concepts).toBeDefined();
    expect(translationCache).toBeDefined();
  });

  it("defines source trust tiers", () => {
    expect(sourceTrustTierEnum.enumValues).toEqual(["tier1", "tier2", "tier3", "tier4"]);
  });
});
