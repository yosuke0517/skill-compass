import Link from "next/link";
import { CalendarClock, Download, Headphones, Settings2, Sparkles } from "lucide-react";

import { enqueuePodcastGenerationAction, retryPodcastJobAction } from "@/app/actions/podcast";
import { requireCurrentUser } from "@/lib/access/current-user";
import { getPodcastEpisodes } from "@/lib/podcast/episodes";
import { getPodcastSettings } from "@/lib/podcast/settings";
import { PodcastEpisodeChat } from "@/components/podcast/podcast-episode-chat";
import { PodcastPlayer } from "@/components/podcast/podcast-player";

export default async function PodcastPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const [user, params] = await Promise.all([requireCurrentUser(), searchParams]);
  const [data, history] = await Promise.all([getPodcastSettings(user.id), getPodcastEpisodes(user.id)]);
  const canGenerate = user.entitlements.has("podcast.generate");
  const readyCount = history.episodes.filter((episode) => episode.status === "ready").length;
  const failedCount = history.episodes.filter((episode) => episode.status === "failed").length;

  return (
    <>
      <div className="screen-title podcast-title-row">
        <div><p className="eyebrow">Audio briefing</p><h1>Podcast</h1></div>
        <Link href="/podcast/settings" className="icon-link" title="Podcast settings" aria-label="Podcast settings"><Settings2 size={19} aria-hidden="true" /></Link>
      </div>
      {params.error === "pro-required" ? <p className="form-error">Podcast generation is available on Pro.</p> : null}
      {params.saved === "queued" ? <p className="form-success">Generation queued.</p> : null}
      {params.saved === "already-queued" ? <p className="form-success">Today&apos;s generation is already queued.</p> : null}
      {params.saved === "retry-queued" ? <p className="form-success">Retry queued.</p> : null}

      <section className="podcast-hero">
        <div className="podcast-art"><Headphones size={34} aria-hidden="true" /></div>
        <div><p className="eyebrow">Private audio briefing</p><h2>Walk, listen, learn.</h2><p>Two voices turn your selected sources into a focused engineering briefing.</p></div>
      </section>

      <section className="podcast-empty-panel">
        <div className="podcast-empty-icon"><Sparkles size={22} aria-hidden="true" /></div>
        <div><h2>{canGenerate ? "Your first briefing is ready to configure" : "Sample briefing"}</h2><p>{canGenerate ? "Choose your sources and schedule, then generate a private episode." : "Upgrade to Pro to generate personal briefings from your sources."}</p></div>
        {canGenerate ? <div className="podcast-actions"><Link href="/podcast/settings" className="button-link">Configure</Link><form action={enqueuePodcastGenerationAction}><button type="submit">Generate preview</button></form></div> : <span className="locked-pill">Pro feature</span>}
      </section>

      <section className="podcast-status-grid">
        <div><CalendarClock size={18} aria-hidden="true" /><span>Schedule</span><strong>{labelFrequency(data.settings.generationFrequency)}</strong></div>
        <div><Headphones size={18} aria-hidden="true" /><span>Length</span><strong>{data.settings.durationMinutes} min</strong></div>
        <div><Download size={18} aria-hidden="true" /><span>Episodes</span><strong>{readyCount} ready{failedCount > 0 ? ` · ${failedCount} failed` : ""}</strong></div>
      </section>

      {history.episodes.length > 0 ? <section className="podcast-episode-list"><div className="management-card-heading"><h2>Recent episodes</h2><span>{history.jobs.length} jobs</span></div>{history.episodes.map((episode) => { const asset = history.assets.find((item) => item.episodeId === episode.id); const job = history.jobs.find((item) => item.episodeId === episode.id); return <article key={episode.id}><div><strong>{episode.title}</strong><small>{episode.language} · {episode.status}</small></div>{asset ? <div className="podcast-episode-actions"><PodcastPlayer src={`/api/podcast/assets/${asset.id}`} title={episode.title} /><a href={`/api/podcast/assets/${asset.id}?download=1`} download>Download</a><PodcastEpisodeChat episodeId={episode.id} title={episode.title} /></div> : job?.status === "failed" ? <form action={retryPodcastJobAction}><input type="hidden" name="jobId" value={job.id} /><button type="submit" className="text-button">Retry</button></form> : <span>{episode.sourceSnapshot.length} sources</span>}</article>; })}</section> : null}

      <section className="management-card podcast-note"><p className="eyebrow">Coming next</p><p>Generated audio, playback, download, and source citations will appear here after the provider pipeline is connected.</p></section>
    </>
  );
}

function labelFrequency(value: string): string {
  return { daily: "Every day", weekdays: "Weekdays", weekly: "Weekly", manual: "Manual" }[value] ?? value;
}
