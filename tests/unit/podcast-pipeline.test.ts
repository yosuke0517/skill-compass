import { describe, expect, it } from "vitest";
import { createDeterministicContentCollector } from "@/lib/podcast/content-collector";
import { createDeterministicScriptGenerator } from "@/lib/podcast/script-generator";

describe("podcast pipeline providers", () => {
  it("collects only enabled sources when the source input is enabled", async () => {
    const collector = createDeterministicContentCollector(() => new Date("2026-07-10T00:00:00.000Z"));
    await expect(collector.collect({
      useSources: true,
      sources: [
        { id: "one", title: "One", url: "https://example.com/one", enabled: true },
        { id: "two", title: "Two", url: "https://example.com/two", enabled: false },
      ],
    })).resolves.toEqual([{ id: "one", title: "One", url: "https://example.com/one", collectedAt: "2026-07-10T00:00:00.000Z" }]);
  });

  it("creates a two-speaker preview script", async () => {
    const generator = createDeterministicScriptGenerator();
    const result = await generator.generate({ language: "ja", durationMinutes: 10, sources: [{ id: "one", title: "My Source", url: "https://example.com", collectedAt: "2026-07-10T00:00:00.000Z" }] });
    expect(result.speakers.length).toBeGreaterThan(2);
    expect(result.speakers.some((line) => line.speaker === "host_b")).toBe(true);
    expect(result.speakers[0].text).toContain("My Source");
  });
});
