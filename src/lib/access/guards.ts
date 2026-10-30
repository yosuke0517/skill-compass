export function canDemoteAdmin(input: {
  targetRole: "admin" | "normal";
  nextRole: "admin" | "normal";
  activeAdminCount: number;
}): boolean {
  return !(input.targetRole === "admin" && input.nextRole !== "admin" && input.activeAdminCount <= 1);
}

/** Shared predicate for admin pages and JSON endpoints. A pro plan alone is insufficient. */
export function hasAdminAccess(user: { role: string; entitlements: ReadonlySet<string> }): boolean {
  return user.role === "admin" && user.entitlements.has("access.manage");
}
