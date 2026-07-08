import { logoutAction } from "@/app/actions/auth";
import { requireSession } from "@/lib/auth/session";

export default async function DashboardPage() {
  const session = await requireSession();
  const expiresAt = new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(session.expiresAt);

  return (
    <main className="mobile-shell dashboard-placeholder">
      <section className="app-surface">
        <header className="app-header">
          <div>
            <p className="eyebrow">Session active</p>
            <h1>Dashboard</h1>
          </div>
          <form action={logoutAction}>
            <button type="submit" className="ghost-button">
              Log out
            </button>
          </form>
        </header>

        <div className="today-card">
          <div>
            <p className="metric-label">Today</p>
            <p className="metric-value">0 / 5</p>
          </div>
          <div className="mini-radar" aria-hidden="true">
            <span />
          </div>
        </div>

        <div className="signal-list">
          <div>
            <span>Weak point</span>
            <strong>Not measured yet</strong>
          </div>
          <div>
            <span>Next review</span>
            <strong>After first quiz</strong>
          </div>
          <div>
            <span>Session until</span>
            <strong>{expiresAt}</strong>
          </div>
        </div>
      </section>
    </main>
  );
}
