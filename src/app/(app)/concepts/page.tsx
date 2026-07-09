import { getConceptsData } from "@/lib/concepts/get-concepts";

export default async function ConceptsPage() {
  const data = await getConceptsData();

  return (
    <>
      <div className="screen-title">
        <p className="eyebrow">Review map</p>
        <h1>Concepts</h1>
      </div>

      <div className="management-stack">
        {data.concepts.map((concept) => (
          <article key={concept.conceptId} className="management-card">
            <div className="management-card-heading">
              <div>
                <h2>{concept.title}</h2>
                <p>{concept.summary}</p>
              </div>
              <strong>{Math.round(concept.score * 100)}%</strong>
            </div>

            <p className="body-copy">{concept.currentUnderstanding}</p>
            <div className="chip-row">
              {concept.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            <div className="stat-row">
              <span>Sources</span>
              <strong>{concept.sourceCount}</strong>
              <span>Next</span>
              <strong>{concept.nextReviewOn ?? "after quiz"}</strong>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
