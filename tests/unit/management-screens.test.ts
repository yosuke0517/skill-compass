import { describe, expect, it } from "vitest";

import { buildConceptsData } from "@/lib/concepts/get-concepts";
import { buildSettingsData } from "@/lib/settings/get-settings";
import { buildSkillsData } from "@/lib/skills/get-skills";
import { buildSourcesData } from "@/lib/sources/get-sources";

describe("management screen read models", () => {
  it("builds skills by category with tag scores and self gaps", () => {
    const data = buildSkillsData({
      categories: [{ id: "cat_frontend", name: "Frontend", description: "UI", displayOrder: 1 }],
      tags: [{ id: "tag_ts", categoryId: "cat_frontend", name: "TypeScript", description: "Types" }],
      scores: [
        { subjectType: "category", subjectId: "cat_frontend", value: 0.55 },
        { subjectType: "tag", subjectId: "tag_ts", value: 0.7 },
      ],
      selfAssessments: [
        { subjectType: "category", subjectId: "cat_frontend", rating: 0.8, assessedOn: "2026-07-09" },
      ],
    });

    expect(data.categories[0]).toMatchObject({
      categoryId: "cat_frontend",
      name: "Frontend",
      measured: 0.55,
      selfRating: 0.8,
      gap: { value: 0.25, label: "overconfidence" },
    });
    expect(data.categories[0]?.tags[0]).toEqual({
      tagId: "tag_ts",
      name: "TypeScript",
      description: "Types",
      score: 0.7,
    });
  });

  it("builds concepts with tags, source counts, scores, and next review", () => {
    const data = buildConceptsData({
      concepts: [{ id: "concept_proxy", title: "reverse proxy", summary: "Routes traffic.", currentUnderstanding: "TLS and routing." }],
      tags: [{ id: "tag_net", name: "Networking" }],
      conceptTags: [{ conceptId: "concept_proxy", tagId: "tag_net" }],
      conceptSources: [
        { conceptId: "concept_proxy", sourceId: "source_mdn" },
        { conceptId: "concept_proxy", sourceId: "source_docs" },
      ],
      scores: [{ subjectType: "concept", subjectId: "concept_proxy", value: 0.42 }],
      answers: [{ questionId: "q_proxy", nextReviewOn: "2026-07-11" }],
      questions: [{ id: "q_proxy", conceptId: "concept_proxy" }],
    });

    expect(data.concepts[0]).toEqual({
      conceptId: "concept_proxy",
      title: "reverse proxy",
      summary: "Routes traffic.",
      currentUnderstanding: "TLS and routing.",
      tags: ["Networking"],
      score: 0.42,
      sourceCount: 2,
      nextReviewOn: "2026-07-11",
    });
  });

  it("builds source rows with related concept counts", () => {
    const data = buildSourcesData({
      sources: [
        {
          id: "source_docs",
          title: "Docs",
          url: "https://example.com",
          trustTier: "tier1",
          official: true,
          status: "active",
          failureReason: null,
        },
      ],
      conceptSources: [
        { sourceId: "source_docs", conceptId: "concept_a" },
        { sourceId: "source_docs", conceptId: "concept_b" },
      ],
    });

    expect(data.sources[0]).toEqual({
      sourceId: "source_docs",
      title: "Docs",
      url: "https://example.com",
      trustTier: "tier1",
      official: true,
      status: "active",
      failureReason: null,
      relatedConceptCount: 2,
    });
  });

  it("builds public-safe settings status", () => {
    const data = buildSettingsData({
      MARKDOWN_EXPORT_DIR: "./exports/skill-compass",
      LLM_PROVIDER: "deterministic",
      ASSISTANT_PROVIDER: "gemini",
      NOTE_WRITER: "filesystem",
      TRANSLATION_PROVIDER: "claude_cli",
      CLAUDE_CLI_COMMAND: "claude",
      CLAUDE_CLI_TIMEOUT_MS: 10000,
      GEMINI_TRANSLATION_MODEL: "gemini-2.5-flash-lite",
      GEMINI_ASSISTANT_MODEL: "gemini-2.5-flash-lite",
    });

    expect(data).toEqual({
      providers: [
        { label: "LLM", value: "deterministic" },
        { label: "Assistant", value: "gemini" },
        { label: "Translation", value: "claude_cli" },
        { label: "Notes", value: "filesystem" },
      ],
      exportDir: "./exports/skill-compass",
      sessionPolicy: "Database user password hash, signed 24 hour session",
      translationRuntime: { label: "Claude CLI", value: "claude" },
    });
  });

  it("shows the Gemini translation model without exposing secrets", () => {
    const data = buildSettingsData({
      MARKDOWN_EXPORT_DIR: "./exports/skill-compass",
      LLM_PROVIDER: "deterministic",
      ASSISTANT_PROVIDER: "gemini",
      NOTE_WRITER: "filesystem",
      TRANSLATION_PROVIDER: "gemini",
      CLAUDE_CLI_COMMAND: "claude",
      CLAUDE_CLI_TIMEOUT_MS: 10000,
      GEMINI_TRANSLATION_MODEL: "gemini-2.5-flash-lite",
      GEMINI_ASSISTANT_MODEL: "gemini-2.5-flash-lite",
    });

    expect(data.translationRuntime).toEqual({ label: "Gemini model", value: "gemini-2.5-flash-lite" });
    expect(JSON.stringify(data)).not.toContain("API_KEY");
  });
});
