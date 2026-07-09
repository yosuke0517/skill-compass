import { conceptSources, sources } from "@/db/schema";

type SourceRow = {
  id: string;
  title: string;
  url: string;
  trustTier: "tier1" | "tier2" | "tier3" | "tier4";
  official: boolean;
  status: "active" | "failed" | "pending";
  failureReason: string | null;
};

type ConceptSourceRow = { sourceId: string; conceptId: string };

export type SourcesData = {
  sources: Array<{
    sourceId: string;
    title: string;
    url: string;
    trustTier: "tier1" | "tier2" | "tier3" | "tier4";
    official: boolean;
    status: "active" | "failed" | "pending";
    failureReason: string | null;
    relatedConceptCount: number;
  }>;
};

export type BuildSourcesInput = {
  sources: SourceRow[];
  conceptSources: ConceptSourceRow[];
};

export async function getSourcesData(): Promise<SourcesData> {
  const { db } = await import("@/db/client");
  const [sourceRows, conceptSourceRows] = await Promise.all([db.select().from(sources), db.select().from(conceptSources)]);

  return buildSourcesData({
    sources: sourceRows,
    conceptSources: conceptSourceRows,
  });
}

export function buildSourcesData(input: BuildSourcesInput): SourcesData {
  return {
    sources: input.sources
      .map((source) => ({
        sourceId: source.id,
        title: source.title,
        url: source.url,
        trustTier: source.trustTier,
        official: source.official,
        status: source.status,
        failureReason: source.failureReason,
        relatedConceptCount: input.conceptSources.filter((link) => link.sourceId === source.id).length,
      }))
      .sort((left, right) => left.trustTier.localeCompare(right.trustTier) || left.title.localeCompare(right.title)),
  };
}
