import { DashboardSummary } from "@/components/dashboard/dashboard-summary";
import { getDashboardData } from "@/lib/dashboard/get-dashboard";

export default async function DashboardPage() {
  const dashboard = await getDashboardData();

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
