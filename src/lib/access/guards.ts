export function canDemoteAdmin(input: {
  targetRole: "admin" | "normal";
  nextRole: "admin" | "normal";
  activeAdminCount: number;
}): boolean {
  return !(input.targetRole === "admin" && input.nextRole !== "admin" && input.activeAdminCount <= 1);
}
