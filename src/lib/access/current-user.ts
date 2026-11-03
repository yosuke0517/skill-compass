import { redirect } from "next/navigation";

import { db } from "@/db/client";
import type { CurrentUserAccess } from "@/lib/access/types";
import { getCurrentUserFromDb } from "./current-user-data";
import { hasAdminAccess } from "@/lib/access/guards";
import { requireSession } from "@/lib/auth/session";

export async function requireCurrentUser(): Promise<CurrentUserAccess> {
  const session = await requireSession();
  if (!session.userId) redirect("/login");
  const user = await getCurrentUserById(session.userId);
  if (!user) redirect("/login");
  return user;
}

export async function getCurrentUserById(userId: string): Promise<CurrentUserAccess | null> {
  return getCurrentUserFromDb(db, userId);
}

export async function requireAdmin(): Promise<CurrentUserAccess> {
  const user = await requireCurrentUser();
  if (!hasAdminAccess(user)) {
    redirect("/settings?error=admin-required");
  }
  return user;
}
