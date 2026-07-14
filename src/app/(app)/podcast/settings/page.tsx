import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft, CalendarDays, Check, KeyRound, Rss } from "lucide-react";

import { savePodcastSettingsAction } from "@/app/actions/podcast";
import { db } from "@/db/client";
import { oauthConnections } from "@/db/schema";
import { requireCurrentUser } from "@/lib/access/current-user";
import { getPodcastSettings } from "@/lib/podcast/settings";

export default async function PodcastSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; oauth?: string; saved?: string }> }) {
  const [user, params] = await Promise.all([requireCurrentUser(), searchParams]);
  const [data, connections] = await Promise.all([
    getPodcastSettings(user.id),
    db.select({ provider: oauthConnections.provider }).from(oauthConnections).where(eq(oauthConnections.userId, user.id)),
  ]);
  const connected = new Set(connections.map((connection) => connection.provider));
  if (!user.entitlements.has("podcast.generate")) {
    return <section className="empty-panel"><KeyRound size={22} aria-hidden="true" /><h2>Pro feature</h2><p>Podcast settings are available for Pro users.</p><Link href="/podcast">Back to Podcast</Link></section>;
  }

  return (
    <>
      <div className="screen-title podcast-title-row"><div><p className="eyebrow">Podcast Studio</p><h1>Settings</h1></div><Link href="/podcast" className="icon-link" title="Back to Podcast" aria-label="Back to Podcast"><ArrowLeft size={19} aria-hidden="true" /></Link></div>
      {params.saved ? <p className="form-success"><Check size={16} aria-hidden="true" />Saved.</p> : null}
      {params.error ? <p className="form-error">Please check your settings.</p> : null}
      {params.oauth === "google-connected" ? <p className="form-success"><Check size={16} aria-hidden="true" />Google Calendar connected.</p> : null}
      {params.oauth === "x-connected" ? <p className="form-success"><Check size={16} aria-hidden="true" />X connected.</p> : null}
      {params.oauth && params.oauth.endsWith("failed") ? <p className="form-error">OAuth connection failed. Check the provider settings and try again.</p> : null}
      <form action={savePodcastSettingsAction} className="podcast-settings-form">
        <section className="management-card"><h2>Generation</h2><div className="podcast-form-grid">
          <label>Frequency<select name="generationFrequency" defaultValue={data.settings.generationFrequency}><option value="daily">Every day</option><option value="weekdays">Weekdays</option><option value="weekly">Weekly</option><option value="manual">Manual</option></select></label>
          <label>Length<select name="durationMinutes" defaultValue={String(data.settings.durationMinutes)}><option value="5">5 minutes</option><option value="10">10 minutes</option><option value="15">15 minutes</option><option value="20">20 minutes</option><option value="30">30 minutes</option></select></label>
          <label>Timezone<input name="timezone" defaultValue={data.settings.timezone} /></label>
          <label>Output language<select name="language" defaultValue={data.settings.language}><option value="ja">Japanese</option><option value="en">English</option></select></label>
        </div></section>

        <section id="connections" className="management-card"><h2>Inputs & connections</h2><label className="podcast-toggle"><input name="useSources" type="checkbox" defaultChecked={data.settings.useSources} /><span><strong>Use Sources</strong><small>Use the selected sources below as briefing material.</small></span></label><label className="podcast-toggle"><input name="includeNews" type="checkbox" defaultChecked={data.settings.includeNews} /><span><strong>News</strong><small>Include current engineering news when available.</small></span></label><div className="podcast-connection-row"><label className="podcast-toggle"><input name="includeCalendar" type="checkbox" defaultChecked={data.settings.includeCalendar} /><span><strong>Google Calendar</strong><small>{connected.has("google-calendar") ? "Connected. Read time and title by default." : "Connect to include today’s schedule."}</small></span></label><Link href="/api/integrations/google/start" className="button-link">{connected.has("google-calendar") ? "Reconnect" : "Connect"}</Link></div><label className="podcast-toggle"><input name="includeXPublic" type="checkbox" defaultChecked={data.settings.includeXPublic} /><span><strong>Public X posts</strong><small>Use public posts as secondary context.</small></span></label><div className="podcast-connection-row"><label className="podcast-toggle"><input name="includeXPersonal" type="checkbox" defaultChecked={data.settings.includeXPersonal} /><span><strong>Personal X timeline and bookmarks</strong><small>{connected.has("x") ? "Connected. Personal sources are available." : "Connect to use your timeline and bookmarks."}</small></span></label><Link href="/api/integrations/x/start" className="button-link">{connected.has("x") ? "Reconnect" : "Connect"}</Link></div></section>

        <section className="management-card"><div className="management-card-heading"><div><h2>Sources</h2><p>Choose how often each source is collected.</p></div><Rss size={21} aria-hidden="true" /></div><div className="podcast-source-list">{data.sources.map((source) => <div key={source.id} className="podcast-source-row"><label className="podcast-source-check"><input name={`sourceEnabled_${source.id}`} type="checkbox" defaultChecked={source.enabled} /><span><strong>{source.title}</strong><small>{source.official ? "Official" : "Community"}</small></span></label><select name={`sourceFrequency_${source.id}`} defaultValue={source.frequency} aria-label={`${source.title} frequency`}><option value="daily">Daily</option><option value="every_3_days">Every 3 days</option><option value="weekly">Weekly</option><option value="every_14_days">Every 14 days</option><option value="monthly">Monthly</option></select></div>)}</div></section>

        <section className="management-card"><div className="management-card-heading"><div><h2>Calendar</h2><p>予定がない日はCalendar inputをスキップします。</p></div><CalendarDays size={21} aria-hidden="true" /></div><p className="body-copy">Connected calendar events are read as time and title by default. OAuth tokens are encrypted before storage.</p></section>
        <button type="submit">Save Podcast settings</button>
      </form>
    </>
  );
}
