import { saveSourceAction } from "@/app/actions/sources";
import { getSourcesData } from "@/lib/sources/get-sources";

export default async function SourcesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [{ error }, data] = await Promise.all([searchParams, getSourcesData()]);

  return (
    <>
      <div className="screen-title">
        <p className="eyebrow">Ground truth</p>
        <h1>Sources</h1>
      </div>

      {error === "invalid-source" ? <p className="form-error">Add a title, URL, and trust tier.</p> : null}

      <section className="management-card">
        <h2>Add source</h2>
        <form action={saveSourceAction} className="source-form">
          <label>
            <span>Title</span>
            <input name="title" required />
          </label>
          <label>
            <span>URL</span>
            <input name="url" type="url" required />
          </label>
          <label>
            <span>Trust</span>
            <select name="trustTier" defaultValue="tier3">
              <option value="tier1">tier1</option>
              <option value="tier2">tier2</option>
              <option value="tier3">tier3</option>
              <option value="tier4">tier4</option>
            </select>
          </label>
          <label className="checkbox-row">
            <input name="official" type="checkbox" />
            <span>Official</span>
          </label>
          <button type="submit">Save source</button>
        </form>
      </section>

      <div className="management-stack">
        {data.sources.map((source) => (
          <article key={source.sourceId} className="management-card">
            <div className="management-card-heading">
              <div>
                <h2>{source.title}</h2>
                <p>{source.url}</p>
              </div>
              <strong>{source.trustTier}</strong>
            </div>
            <div className="stat-row">
              <span>Status</span>
              <strong>{source.status}</strong>
              <span>Concepts</span>
              <strong>{source.relatedConceptCount}</strong>
            </div>
            {source.failureReason ? <p className="form-error">{source.failureReason}</p> : null}
          </article>
        ))}
      </div>
    </>
  );
}
