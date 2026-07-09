import { logoutAction } from "@/app/actions/auth";
import { getSettingsData } from "@/lib/settings/get-settings";

export default async function SettingsPage() {
  const data = await getSettingsData();

  return (
    <>
      <div className="screen-title">
        <p className="eyebrow">Local runtime</p>
        <h1>Settings</h1>
      </div>

      <div className="management-stack settings-stack">
        <section className="management-card">
          <h2>Providers</h2>
          <div className="compact-list">
            {data.providers.map((provider) => (
              <div key={provider.label}>
                <span>{provider.label}</span>
                <strong>{provider.value}</strong>
              </div>
            ))}
            <div>
              <span>{data.translationRuntime.label}</span>
              <strong>{data.translationRuntime.value}</strong>
            </div>
          </div>
        </section>

        <section className="management-card">
          <h2>Export</h2>
          <p className="body-copy">{data.exportDir}</p>
        </section>

        <section className="management-card">
          <h2>Session</h2>
          <p className="body-copy">{data.sessionPolicy}</p>
          <form action={logoutAction}>
            <button type="submit">Log out</button>
          </form>
        </section>
      </div>
    </>
  );
}
