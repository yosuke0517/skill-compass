import { ADMIN_FIXED_ENTITLEMENTS } from "@/lib/access/catalog";
import type { EntitlementId, EntitlementOverride, RoleId } from "@/lib/access/types";

export function resolveEntitlements(input: {
  role: RoleId;
  planDefaults: EntitlementId[];
  overrides: EntitlementOverride[];
}): ReadonlySet<EntitlementId> {
  const resolved = new Set(input.planDefaults);

  for (const override of input.overrides) {
    if (override.enabled) resolved.add(override.entitlementId);
    else resolved.delete(override.entitlementId);
  }

  if (input.role === "admin") {
    for (const entitlement of ADMIN_FIXED_ENTITLEMENTS) resolved.add(entitlement);
  }

  return new Set([...resolved].sort());
}
