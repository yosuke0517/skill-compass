import { describe, expect, it } from "vitest";
import { canDemoteAdmin } from "@/lib/access/guards";
import { resolveEntitlements } from "@/lib/access/resolve-entitlements";

describe("resolveEntitlements", () => {
  it("applies user overrides after plan defaults", () => {
    const result = resolveEntitlements({
      role: "normal",
      planDefaults: ["podcast.sample.view", "podcast.generate"],
      overrides: [
        { entitlementId: "podcast.generate", enabled: false },
        { entitlementId: "podcast.download", enabled: true },
      ],
    });

    expect([...result]).toEqual(["podcast.download", "podcast.sample.view"]);
  });

  it("always grants admin management capabilities", () => {
    const result = resolveEntitlements({
      role: "admin",
      planDefaults: [],
      overrides: [{ entitlementId: "access.manage", enabled: false }],
    });

    expect(result.has("access.manage")).toBe(true);
    expect(result.has("integration.manage")).toBe(true);
    expect(result.has("podcast.english.generate")).toBe(true);
    expect(result.has("x.publish")).toBe(true);
  });

  it("prevents demoting the final active admin", () => {
    expect(canDemoteAdmin({ targetRole: "admin", nextRole: "normal", activeAdminCount: 1 })).toBe(false);
    expect(canDemoteAdmin({ targetRole: "admin", nextRole: "normal", activeAdminCount: 2 })).toBe(true);
    expect(canDemoteAdmin({ targetRole: "normal", nextRole: "normal", activeAdminCount: 1 })).toBe(true);
  });
});
