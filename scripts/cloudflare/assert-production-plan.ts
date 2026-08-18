import { readFileSync } from "node:fs";

type ResourceChange = { address?: string; change?: { actions?: string[] } };
type TerraformPlan = { resource_changes?: ResourceChange[] };

export function assertSafeProductionPlan(plan: TerraformPlan) {
  for (const resource of plan.resource_changes ?? []) {
    const address = resource.address ?? "unknown";
    const actions = resource.change?.actions ?? [];
    if (/staging/i.test(address)) throw new Error(`staging_resource_in_production_plan:${address}`);
    if (actions.includes("delete")) throw new Error(`destructive_production_plan:${address}`);
    if (!actions.every((action) => ["no-op", "read", "create", "update"].includes(action))) {
      throw new Error(`unsupported_production_plan_action:${address}`);
    }
  }
  return { safe: true, resourceChanges: plan.resource_changes?.length ?? 0 };
}

function main() {
  const path = process.argv[2];
  if (!path) throw new Error("Terraform plan JSON path is required");
  console.log(JSON.stringify(assertSafeProductionPlan(JSON.parse(readFileSync(path, "utf8")) as TerraformPlan)));
}

if (process.argv[1]?.endsWith("assert-production-plan.ts")) main();
