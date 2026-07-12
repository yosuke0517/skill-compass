import type { ReactNode } from "react";

import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdmin } from "@/lib/access/current-user";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const actor = await requireAdmin();
  return <AdminShell actor={{ displayName: actor.displayName, email: actor.email }}>{children}</AdminShell>;
}
