import { logoutAction } from "@/app/actions/auth";
import { requireSession } from "@/lib/auth/session";

export default async function DashboardPage() {
  const session = await requireSession();

  return (
    <main className="dashboard-placeholder">
      <section>
        <p className="eyebrow">Session active</p>
        <h1>Dashboard</h1>
        <p>
          Your protected Skill Compass workspace is ready. The full dashboard arrives in the
          dashboard task.
        </p>
        <p className="session-note">Session expires at {session.expiresAt.toISOString()}</p>
        <form action={logoutAction}>
          <button type="submit">Log out</button>
        </form>
      </section>
    </main>
  );
}
