import type { ReactNode } from "react";

import { AppNav } from "@/components/app-nav";
import { requireSession } from "@/lib/auth/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireSession();

  return (
    <main className="mobile-shell">
      <section className="app-surface app-frame">
        {children}
        <AppNav />
      </section>
    </main>
  );
}
