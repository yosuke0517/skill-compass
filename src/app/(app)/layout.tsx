import type { ReactNode } from "react";

import { logoutAction } from "@/app/actions/auth";
import { AppNav } from "@/components/app-nav";
import { requireSession } from "@/lib/auth/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  const expiresAt = new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(session.expiresAt);

  return (
    <main className="mobile-shell dashboard-shell">
      <section className="app-surface app-frame">
        <header className="app-header">
          <div>
            <p className="eyebrow">Session active</p>
            <p className="session-copy">Until {expiresAt}</p>
          </div>
          <form action={logoutAction}>
            <button type="submit" className="ghost-button">
              Log out
            </button>
          </form>
        </header>
        {children}
        <AppNav />
      </section>
    </main>
  );
}
