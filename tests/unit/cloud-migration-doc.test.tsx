import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CloudMigrationView } from "@/components/docs/cloud-migration-view";
import { getCloudMigrationDocument } from "@/lib/docs/cloud-migration";

describe("cloud migration document", () => {
  it("keeps the approved migration controls and current production status together", () => {
    const document = getCloudMigrationDocument();

    expect(document.status).toMatchObject({
      phase: "Phase 0",
      production: "Production traffic remains on the Mac mini.",
    });
    expect(document.architectures.map((architecture) => architecture.title)).toEqual([
      "Current architecture",
      "Target architecture",
    ]);
    expect(document.responsibilities.map((responsibility) => responsibility.owner)).toEqual([
      "Terraform",
      "Wrangler",
      "HCP Terraform",
      "GitHub Actions",
      "Workers Secrets",
    ]);
    expect(document.phases.map((phase) => phase.status)).toEqual([
      "In progress",
      "Planned",
      "Planned",
    ]);
    expect(document.stagingChecks.length).toBeGreaterThanOrEqual(6);
    expect(document.productionApproval.steps.length).toBeGreaterThanOrEqual(6);
    expect(document.rollback.beforeWrites).toContain("Mac");
    expect(document.rollback.afterWrites).toContain("reconciliation");
    expect(document.security.length).toBeGreaterThanOrEqual(6);
    expect(document.cost.length).toBeGreaterThanOrEqual(3);
  });

  it("renders a semantic, mobile-scannable guide", () => {
    render(<CloudMigrationView document={getCloudMigrationDocument()} />);

    expect(screen.getByRole("heading", { level: 1, name: "Cloud migration" })).toBeTruthy();

    for (const heading of [
      "Current architecture",
      "Target architecture",
      "Tool ownership",
      "Phase progress",
      "Staging checks",
      "Production approval",
      "Rollback",
      "Security",
      "Cost guardrails",
    ]) {
      expect(screen.getByRole("heading", { level: 2, name: heading })).toBeTruthy();
    }

    expect(
      within(screen.getByRole("list", { name: "Current architecture flow" })).getAllByRole(
        "listitem",
      ),
    ).toHaveLength(6);
    expect(
      within(screen.getByRole("list", { name: "Target architecture flow" })).getAllByRole(
        "listitem",
      ).length,
    ).toBeGreaterThanOrEqual(6);
    expect(screen.getByText("Production traffic remains on the Mac mini.")).toBeTruthy();
  });
});
