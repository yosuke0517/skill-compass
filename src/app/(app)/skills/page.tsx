import { saveSelfAssessmentAction } from "@/app/actions/self-assessments";
import { getSkillsData } from "@/lib/skills/get-skills";

export default async function SkillsPage() {
  const data = await getSkillsData();

  return (
    <>
      <div className="screen-title">
        <p className="eyebrow">Measured axes</p>
        <h1>Skills</h1>
      </div>

      <div className="management-stack">
        {data.categories.map((category) => (
          <section key={category.categoryId} className="management-card">
            <div className="management-card-heading">
              <div>
                <h2>{category.name}</h2>
                <p>{category.description}</p>
              </div>
              <strong>{Math.round(category.measured * 100)}%</strong>
            </div>

            <div className="stat-row">
              <span>Self</span>
              <strong>{category.selfRating === null ? "new" : `${Math.round(category.selfRating * 100)}%`}</strong>
              <span>Gap</span>
              <strong>{category.gap ? category.gap.label : "unrated"}</strong>
            </div>

            <form action={saveSelfAssessmentAction} className="inline-form">
              <input type="hidden" name="subjectId" value={category.categoryId} />
              <label>
                <span>Self rating</span>
                <input name="rating" type="number" min="0" max="1" step="0.05" defaultValue={category.selfRating ?? 0.5} />
              </label>
              <button type="submit">Save</button>
            </form>

            <div className="compact-list">
              {category.tags.map((tag) => (
                <div key={tag.tagId}>
                  <span>{tag.name}</span>
                  <strong>{Math.round(tag.score * 100)}%</strong>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
