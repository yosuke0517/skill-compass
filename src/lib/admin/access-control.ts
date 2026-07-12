import { ADMIN_FIXED_ENTITLEMENTS, ENTITLEMENT_IDS, PLAN_IDS } from "@/lib/access/catalog";
import type { PlanId, RoleId } from "@/lib/access/types";

export type CapabilitySource = "admin" | "plan" | "override_allow" | "override_deny" | "none";
type SelectedCapability = { id: string; description: string; source: CapabilitySource; enabled: boolean };

export type AccessControlData = {
  users: Array<{
    id: string;
    email: string;
    displayName: string | null;
    role: RoleId;
    plan: PlanId;
    status: "active" | "invited" | "disabled";
  }>;
  plans: Array<{
    id: PlanId;
    capabilities: Array<{ id: string; description: string; enabled: boolean }>;
  }>;
  selectedUser?: {
    id: string;
    email: string;
    displayName: string | null;
    role: RoleId;
    plan: PlanId;
    capabilities: SelectedCapability[];
  };
  recentAudit: Array<{ id: string; action: string; targetType: string; targetId: string; createdAt: Date }>;
};

type AccessInput = {
  users: AccessControlData["users"];
  entitlements: Array<{ id: string; description: string }>;
  planDefaults: Array<{ planId: string; entitlementId: string; enabled: boolean }>;
  overrides: Array<{ userId: string; entitlementId: string; enabled: boolean }>;
  auditLogs: AccessControlData["recentAudit"];
  selectedUserId?: string;
};

export function buildAccessControlData(input: AccessInput): AccessControlData {
  const order = new Map<string, number>(ENTITLEMENT_IDS.map((id, index) => [id, index]));
  const sortCapabilities = <T extends { id: string }>(items: T[]) =>
    items.sort((a, b) => (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER));

  const plans = PLAN_IDS.map((planId) => ({
    id: planId,
    capabilities: sortCapabilities(
      input.entitlements.map((item) => ({
        id: item.id,
        description: item.description,
        enabled: input.planDefaults.some(
          (row) => row.planId === planId && row.entitlementId === item.id && row.enabled,
        ),
      })),
    ),
  }));

  const selected = input.users.find((user) => user.id === input.selectedUserId) ?? input.users[0];
  const selectedUser = selected
    ? {
        ...selected,
        capabilities: sortCapabilities(
          input.entitlements.map((item) => {
            const override = input.overrides.find(
              (row) => row.userId === selected.id && row.entitlementId === item.id,
            );
            const planDefault = input.planDefaults.find(
              (row) => row.planId === selected.plan && row.entitlementId === item.id,
            );
            const adminFixed = selected.role === "admin" && new Set<string>(ADMIN_FIXED_ENTITLEMENTS).has(item.id);

            return {
              id: item.id,
              description: item.description,
              source: adminFixed
                ? "admin"
                : override
                  ? override.enabled
                    ? "override_allow"
                    : "override_deny"
                  : planDefault?.enabled
                    ? "plan"
                    : "none",
              enabled: adminFixed || override?.enabled === true || (!override && planDefault?.enabled === true),
              } satisfies SelectedCapability;
          }),
        ),
      }
    : undefined;

  return { users: input.users, plans, selectedUser, recentAudit: input.auditLogs };
}

export async function getAccessControlData(selectedUserId?: string): Promise<AccessControlData> {
  const [{ desc }, { db }, { auditLogs, entitlements, planEntitlements, userEntitlementOverrides, users }, { requireAdmin }] =
    await Promise.all([
      import("drizzle-orm"),
      import("@/db/client"),
      import("@/db/schema"),
      import("@/lib/access/current-user"),
    ]);
  await requireAdmin();

  const [userRows, entitlementRows, planRows, overrideRows, auditRows] = await Promise.all([
    db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        role: users.role,
        plan: users.plan,
        status: users.status,
      })
      .from(users),
    db.select({ id: entitlements.id, description: entitlements.description }).from(entitlements),
    db.select().from(planEntitlements),
    db.select().from(userEntitlementOverrides),
    db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        targetType: auditLogs.targetType,
        targetId: auditLogs.targetId,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(50),
  ]);

  return buildAccessControlData({
    users: userRows.filter(isAccessUser),
    entitlements: entitlementRows,
    planDefaults: planRows,
    overrides: overrideRows,
    auditLogs: auditRows,
    selectedUserId,
  });
}

function isAccessUser(user: { role: string; plan: string; status: "active" | "invited" | "disabled" }): user is AccessControlData["users"][number] {
  return (user.role === "admin" || user.role === "normal") && (user.plan === "free" || user.plan === "pro");
}
