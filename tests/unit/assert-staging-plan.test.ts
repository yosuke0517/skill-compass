import { describe, expect, it } from "vitest";

import { assertSafeStagingPlan } from "../../scripts/cloudflare/assert-staging-plan";

describe("staging Terraform plan guard", () => {
  it("allows only non-destructive staging creates and updates", () => {
    expect(assertSafeStagingPlan({ resource_changes: [
      { address: "cloudflare_d1_database.staging[0]", change: { actions: ["no-op"] } },
      { address: "cloudflare_worker.staging[0]", change: { actions: ["update"] } },
    ] })).toEqual({ safe: true, resourceChanges: 2 });
  });

  it.each([
    [{ address: "cloudflare_d1_database.staging[0]", change: { actions: ["delete"] } }, "destructive_staging_plan"],
    [{ address: "cloudflare_r2_bucket.staging[0]", change: { actions: ["delete", "create"] } }, "destructive_staging_plan"],
    [{ address: "cloudflare_r2_bucket.production[0]", change: { actions: ["no-op"] } }, "production_resource_in_staging_plan"],
  ])("rejects unsafe plan change %#", (resource, error) => {
    expect(() => assertSafeStagingPlan({ resource_changes: [resource] })).toThrow(error);
  });
});
