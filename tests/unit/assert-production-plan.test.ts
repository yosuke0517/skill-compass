import { describe, expect, it } from "vitest";

import { assertSafeProductionPlan } from "../../scripts/cloudflare/assert-production-plan";

describe("production Terraform plan guard", () => {
  it("allows production creates, imports, no-ops, and safe updates", () => {
    expect(assertSafeProductionPlan({ resource_changes: [
      { address: "cloudflare_d1_database.production[0]", change: { actions: ["create"] } },
      { address: "cloudflare_r2_bucket.production[0]", change: { actions: ["no-op"] } },
    ] })).toEqual({ safe: true, resourceChanges: 2 });
  });

  it.each([
    [{ address: "cloudflare_d1_database.production[0]", change: { actions: ["delete"] } }, "destructive_production_plan"],
    [{ address: "cloudflare_r2_bucket.production[0]", change: { actions: ["delete", "create"] } }, "destructive_production_plan"],
    [{ address: "cloudflare_worker.staging[0]", change: { actions: ["no-op"] } }, "staging_resource_in_production_plan"],
  ])("rejects unsafe plan change %#", (resource, error) => {
    expect(() => assertSafeProductionPlan({ resource_changes: [resource] })).toThrow(error);
  });
});
