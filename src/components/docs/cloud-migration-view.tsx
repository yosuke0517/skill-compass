import type { CloudMigrationDocument } from "@/lib/docs/cloud-migration";

type CloudMigrationViewProps = {
  document: CloudMigrationDocument;
};

export function CloudMigrationView({ document }: CloudMigrationViewProps) {
  return (
    <article className="migration-document">
      <header className="migration-hero">
        <div>
          <p className="eyebrow">Infrastructure runbook</p>
          <h1>Cloud migration</h1>
        </div>
        <span className="migration-phase">{document.status.phase}</span>
        <div className="migration-status" role="status">
          <strong>{document.status.production}</strong>
          <span>{document.status.label}</span>
          <p>{document.status.detail}</p>
        </div>
      </header>

      <div className="migration-architecture-grid">
        {document.architectures.map((architecture) => (
          <section
            className={`migration-architecture migration-architecture-${architecture.id}`}
            key={architecture.id}
          >
            <p className="migration-section-label">
              {architecture.id === "current" ? "Live path" : "Approved destination"}
            </p>
            <h2>{architecture.title}</h2>
            <p>{architecture.description}</p>
            <ol className="migration-flow" aria-label={architecture.flowLabel}>
              {architecture.nodes.map((node) => (
                <li key={node}>{node}</li>
              ))}
            </ol>
          </section>
        ))}
      </div>

      <section className="migration-section">
        <p className="migration-section-label">Clear boundaries</p>
        <h2>Tool ownership</h2>
        <div className="migration-owner-list">
          {document.responsibilities.map((responsibility) => (
            <article key={responsibility.owner}>
              <h3>{responsibility.owner}</h3>
              <p>{responsibility.summary}</p>
              <ul>
                {responsibility.responsibilities.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="migration-section">
        <p className="migration-section-label">Trunk-based delivery</p>
        <h2>Branch and deployment</h2>
        <p>{document.deployment.summary}</p>
        <div className="migration-branch-grid">
          <article>
            <h3>Pull request</h3>
            <ul>
              {document.deployment.pullRequest.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
          <article>
            <h3>Merge to main</h3>
            <ol>
              {document.deployment.staging.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </article>
        </div>
      </section>

      <section className="migration-section">
        <p className="migration-section-label">Delivery sequence</p>
        <h2>Phase progress</h2>
        <div className="migration-phase-list">
          {document.phases.map((phase) => (
            <article key={phase.id}>
              <div>
                <span>{phase.label}</span>
                <strong data-status={phase.status}>{phase.status}</strong>
              </div>
              <h3>{phase.title}</h3>
              <p>{phase.scope}</p>
              <small>{phase.completion}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="migration-section migration-checklist">
        <p className="migration-section-label">Manual gate</p>
        <h2>Staging checks</h2>
        <ul>
          {document.stagingChecks.map((check) => (
            <li key={check}>{check}</li>
          ))}
        </ul>
      </section>

      <section className="migration-section migration-approval">
        <p className="migration-section-label">Protected environment</p>
        <h2>Production approval</h2>
        <p>{document.productionApproval.summary}</p>
        <ol>
          {document.productionApproval.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <section className="migration-section">
        <p className="migration-section-label">Data-aware recovery</p>
        <h2>Rollback</h2>
        <div className="migration-rollback-grid">
          <article>
            <h3>Before writes</h3>
            <p>{document.rollback.beforeWrites}</p>
          </article>
          <article>
            <h3>After writes</h3>
            <p>{document.rollback.afterWrites}</p>
          </article>
        </div>
      </section>

      <div className="migration-final-grid">
        <section className="migration-section">
          <p className="migration-section-label">Non-negotiable</p>
          <h2>Security</h2>
          <ul>
            {document.security.map((control) => (
              <li key={control}>{control}</li>
            ))}
          </ul>
        </section>
        <section className="migration-section">
          <p className="migration-section-label">Operate lean</p>
          <h2>Cost guardrails</h2>
          <ul>
            {document.cost.map((guardrail) => (
              <li key={guardrail}>{guardrail}</li>
            ))}
          </ul>
        </section>
      </div>
    </article>
  );
}
