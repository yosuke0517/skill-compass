import type { ENTITLEMENT_IDS, PLAN_IDS, ROLE_IDS } from "@/lib/access/catalog";

export type RoleId = (typeof ROLE_IDS)[number];
export type PlanId = (typeof PLAN_IDS)[number];
export type EntitlementId = (typeof ENTITLEMENT_IDS)[number];

export type EntitlementOverride = {
  entitlementId: EntitlementId;
  enabled: boolean;
};

export type CurrentUserAccess = {
  id: string;
  email: string;
  displayName: string | null;
  role: RoleId;
  plan: PlanId;
  entitlements: ReadonlySet<EntitlementId>;
};
