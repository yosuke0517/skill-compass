"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db/client";
import { auditLogs, planEntitlements, userEntitlementOverrides, users } from "@/db/schema";
import { ENTITLEMENT_IDS, PLAN_IDS, ROLE_IDS } from "@/lib/access/catalog";
import { requireAdmin } from "@/lib/access/current-user";
import { canDemoteAdmin } from "@/lib/access/guards";

const roles = new Set<string>(ROLE_IDS);
const plans = new Set<string>(PLAN_IDS);
const entitlementIds = new Set<string>(ENTITLEMENT_IDS);
const modes = new Set(["inherit", "allow", "deny"]);

export async function updateUserRoleAndPlanAction(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "");
  const plan = String(formData.get("plan") ?? "");
  if (!userId || !roles.has(role) || !plans.has(plan)) redirect("/admin/access?error=invalid-input");

  const actor = await requireAdmin();
  let blocked = false;
  await db.transaction(async (tx) => {
    const [target] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!target) {
      blocked = true;
      return;
    }

    const activeAdmins = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, "admin"), eq(users.status, "active")));
    if (!canDemoteAdmin({
      targetRole: target.role as "admin" | "normal",
      nextRole: role as "admin" | "normal",
      activeAdminCount: activeAdmins.length,
    })) {
      blocked = true;
      return;
    }

    await tx.update(users).set({ role, plan }).where(eq(users.id, userId));
    await tx.insert(auditLogs).values({
      id: `audit_${randomUUID()}`,
      actorUserId: actor.id,
      action: "access.user.updated",
      targetType: "user",
      targetId: userId,
      metadata: { previousRole: target.role, nextRole: role, previousPlan: target.plan, nextPlan: plan },
    });
  });

  if (blocked) redirect(`/admin/access?user=${encodeURIComponent(userId)}&error=last-admin`);

  revalidatePath("/admin/access");
  redirect(`/admin/access?user=${encodeURIComponent(userId)}&saved=user`);
}

export async function updatePlanEntitlementAction(formData: FormData) {
  const planId = String(formData.get("planId") ?? "");
  const entitlementId = String(formData.get("entitlementId") ?? "");
  const enabled = formData.get("enabled") === "on";
  if (!plans.has(planId) || !entitlementIds.has(entitlementId)) redirect("/admin/access?error=invalid-input");

  const actor = await requireAdmin();
  await db.insert(planEntitlements).values({ planId, entitlementId, enabled }).onDuplicateKeyUpdate({ set: { enabled } });
  await db.insert(auditLogs).values({
    id: `audit_${randomUUID()}`,
    actorUserId: actor.id,
    action: "access.plan-entitlement.updated",
    targetType: "plan",
    targetId: planId,
    metadata: { entitlementId, enabled },
  });

  revalidatePath("/admin/access");
  redirect("/admin/access?saved=plan");
}

export async function updateUserEntitlementAction(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  const entitlementId = String(formData.get("entitlementId") ?? "");
  const mode = String(formData.get("mode") ?? "inherit");
  if (!userId || !entitlementIds.has(entitlementId) || !modes.has(mode)) redirect("/admin/access?error=invalid-input");

  const actor = await requireAdmin();
  const [target] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (!target) redirect("/admin/access?error=invalid-input");
  if (target.role === "admin" && entitlementId === "access.manage" && mode === "deny") {
    redirect(`/admin/access?user=${encodeURIComponent(userId)}&error=admin-fixed-entitlement`);
  }

  if (mode === "inherit") {
    await db.delete(userEntitlementOverrides).where(
      and(eq(userEntitlementOverrides.userId, userId), eq(userEntitlementOverrides.entitlementId, entitlementId)),
    );
  } else {
    await db.insert(userEntitlementOverrides)
      .values({ userId, entitlementId, enabled: mode === "allow" })
      .onDuplicateKeyUpdate({ set: { enabled: mode === "allow" } });
  }

  await db.insert(auditLogs).values({
    id: `audit_${randomUUID()}`,
    actorUserId: actor.id,
    action: "access.user-entitlement.updated",
    targetType: "user",
    targetId: userId,
    metadata: { mode },
  });

  revalidatePath("/admin/access");
  redirect(`/admin/access?user=${encodeURIComponent(userId)}&saved=entitlement`);
}
