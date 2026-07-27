import type { QuestionArtifact } from "@/db/schema";

export function QuestionArtifacts({ artifacts }: { artifacts: QuestionArtifact[] }) {
  if (artifacts.length === 0) return null;

  return (
    <section className="question-artifacts" aria-label="Supporting material">
      {artifacts.map((artifact, index) => (
        <article
          className="question-artifact"
          key={`${artifact.kind}-${artifact.title}-${index}`}
        >
          <header>
            <strong>{artifact.title}</strong>
            <span>{artifact.language ?? artifact.kind}</span>
          </header>
          <pre>
            <code>{artifact.content}</code>
          </pre>
        </article>
      ))}
    </section>
  );
}
