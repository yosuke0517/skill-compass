import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { QuestionArtifacts } from "@/components/quiz/question-artifacts";

afterEach(cleanup);

describe("QuestionArtifacts", () => {
  it("renders source artifacts as escaped preformatted text inside scroll containers", () => {
    const { container } = render(
      <QuestionArtifacts
        artifacts={[
          {
            kind: "code",
            title: "TypeScript handler",
            language: "typescript",
            content: 'const label: string = "<script>alert(1)</script>";',
          },
          {
            kind: "sql",
            title: "Slow query",
            language: "sql",
            content: "SELECT * FROM orders WHERE customer_id = ?;",
          },
          {
            kind: "diagram",
            title: "Request path",
            content: "browser -> reverse proxy -> API",
          },
        ]}
      />,
    );

    expect(screen.getByText("TypeScript handler")).toBeTruthy();
    expect(screen.getByText("Slow query")).toBeTruthy();
    expect(screen.getByText("Request path")).toBeTruthy();
    expect(
      screen.getByText('const label: string = "<script>alert(1)</script>";'),
    ).toBeTruthy();
    expect(container.querySelector("script")).toBeNull();

    const artifactContainers = container.querySelectorAll(".question-artifact");
    expect(artifactContainers).toHaveLength(3);
    expect(container.querySelectorAll(".question-artifact > pre > code")).toHaveLength(3);
    expect(artifactContainers[0]?.querySelector("code")?.textContent).toBe(
      'const label: string = "<script>alert(1)</script>";',
    );
  });
});
