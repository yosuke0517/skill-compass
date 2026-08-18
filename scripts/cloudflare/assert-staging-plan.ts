import { readFileSync } from "node:fs";

type ResourceChange = { address?: string; change?: { actions?: string[] } };
type TerraformPlan = { resource_changes?: ResourceChange[] };

export function assertSafeStagingPlan(plan: TerraformPlan) {
  for (const resource of plan.resource_changes ?? []) {
    const address = resource.address ?? "unknown";
    const actions = resource.change?.actions ?? [];
    if (/production/i.test(address)) throw new Error(`production_resource_in_staging_plan:${address}`);
    if (actions.includes("delete")) throw new Error(`destructive_staging_plan:${address}`);
    if (!actions.every((action) => ["no-op", "read", "create", "update"].includes(action))) {
      throw new Error(`unsupported_staging_plan_action:${address}`);
    }
  }
  return { safe: true, resourceChanges: plan.resource_changes?.length ?? 0 };
}

function main() {
  const path = process.argv[2];
  if (!path) throw new Error("Terraform plan JSON path is required");
  console.log(JSON.stringify(assertSafeStagingPlan(JSON.parse(readFileSync(path, "utf8")) as TerraformPlan)));
}

if (process.argv[1]?.endsWith("assert-staging-plan.ts")) main();
