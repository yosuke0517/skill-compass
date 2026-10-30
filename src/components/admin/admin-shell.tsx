import Link from "next/link";
import { ArrowLeft, LockKeyhole, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

import { logoutAction } from "@/app/actions/auth";

export function AdminShell({
  actor,
  children,
}: {
  actor: { displayName: string | null; email: string };
  children: ReactNode;
}) {
  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div className="admin-brand">
          <div className="admin-brand-mark"><ShieldCheck size={20} aria-hidden="true" /></div>
          <div>
            <p className="eyebrow">Skill Compass</p>
            <strong>管理コンソール</strong>
          </div>
        </div>
        <div className="admin-actor">
          <span>{actor.displayName ?? actor.email}</span>
          <form action={logoutAction}><button type="submit" className="admin-logout">ログアウト</button></form>
        </div>
      </header>
      <div className="admin-body">
        <aside className="admin-sidebar">
          <nav aria-label="管理メニュー">
            <p className="admin-nav-label">Workspace</p>
            <Link href="/admin/access"><LockKeyhole size={17} aria-hidden="true" />Access</Link>
            <Link href="/admin/interview">面接サポート</Link>
            <a href="/admin/access#plans">Plans</a>
            <a href="/admin/access#users">Users</a>
            <a href="/admin/access#integrations">Integrations</a>
            <a href="/admin/access#audit">Audit</a>
          </nav>
          <Link href="/settings" className="admin-back"><ArrowLeft size={16} aria-hidden="true" />Settingsへ戻る</Link>
        </aside>
        <section className="admin-content">{children}</section>
      </div>
    </main>
  );
}
