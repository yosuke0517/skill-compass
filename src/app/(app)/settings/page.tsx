import Link from "next/link";
import { ArrowRight, BookOpen, Brain, Compass, ShieldCheck } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { getSettingsData } from "@/lib/settings/get-settings";
import { requireCurrentUser } from "@/lib/access/current-user";

export default async function SettingsPage() {
  const [data, currentUser] = await Promise.all([getSettingsData(), requireCurrentUser()]);

  return (
    <>
      <div className="screen-title">
        <p className="eyebrow">Local runtime</p>
        <h1>Settings</h1>
      </div>

      <div className="management-stack settings-stack">
        <section className="management-card">
          <div className="management-card-heading">
            <div>
              <h2>Manage</h2>
              <p>Reference data and learning detail views.</p>
            </div>
          </div>
          <div className="settings-link-list">
            <Link href="/sources">
              <BookOpen size={18} aria-hidden="true" />
              <span>
                <strong>Sources</strong>
                <small>Trusted references and source status</small>
              </span>
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link href="/skills">
              <Compass size={18} aria-hidden="true" />
              <span>
                <strong>Skills</strong>
                <small>Dashboard axes and calibration detail</small>
              </span>
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link href="/concepts">
              <Brain size={18} aria-hidden="true" />
              <span>
                <strong>Concepts</strong>
                <small>Topic scores, tags, and review dates</small>
              </span>
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
            {currentUser.role === "admin" ? (
              <Link href="/admin/access">
                <ShieldCheck size={18} aria-hidden="true" />
                <span>
                  <strong>Access control</strong>
                  <small>Users, plans, and entitlements</small>
                </span>
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            ) : null}
          </div>
        </section>

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
