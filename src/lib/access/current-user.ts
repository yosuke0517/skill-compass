import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/db/client";
import { planEntitlements, userEntitlementOverrides, users } from "@/db/schema";
import { ENTITLEMENT_IDS, PLAN_IDS, ROLE_IDS } from "@/lib/access/catalog";
import { resolveEntitlements } from "@/lib/access/resolve-entitlements";
import type { CurrentUserAccess, EntitlementId, PlanId, RoleId } from "@/lib/access/types";
import { requireSession } from "@/lib/auth/session";

export async function requireCurrentUser(): Promise<CurrentUserAccess> {
  const session = await requireSession();
  if (!session.userId) redirect("/login");

  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, session.userId), eq(users.status, "active")))
    .limit(1);
  if (!user || !ROLE_IDS.includes(user.role as RoleId) || !PLAN_IDS.includes(user.plan as PlanId)) {
    redirect("/login");
  }

  const [defaults, overrides] = await Promise.all([
    db.select().from(planEntitlements).where(eq(planEntitlements.planId, user.plan)),
    db.select().from(userEntitlementOverrides).where(eq(userEntitlementOverrides.userId, user.id)),
  ]);
  const valid = new Set<string>(ENTITLEMENT_IDS);

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role as RoleId,
    plan: user.plan as PlanId,
    entitlements: resolveEntitlements({
      role: user.role as RoleId,
      planDefaults: defaults
        .filter((row) => row.enabled && valid.has(row.entitlementId))
        .map((row) => row.entitlementId as EntitlementId),
      overrides: overrides
        .filter((row) => valid.has(row.entitlementId))
        .map((row) => ({ entitlementId: row.entitlementId as EntitlementId, enabled: row.enabled })),
    }),
  };
}

export async function requireAdmin(): Promise<CurrentUserAccess> {
  const user = await requireCurrentUser();
  if (user.role !== "admin" || !user.entitlements.has("access.manage")) {
    redirect("/settings?error=admin-required");
  }
  return user;
}
