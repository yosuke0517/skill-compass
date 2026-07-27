import { DashboardSummary } from "@/components/dashboard/dashboard-summary";
import { requireCurrentUser } from "@/lib/access/current-user";
import { getDashboardData } from "@/lib/dashboard/get-dashboard";

export default async function DashboardPage() {
  const user = await requireCurrentUser();
  const dashboard = await getDashboardData(user.id);

  return (
    <>
      <div className="screen-title">
        <p className="eyebrow">Skill Compass</p>
        <h1>Dashboard</h1>
      </div>
      <DashboardSummary data={dashboard} />
    </>
  );
}
