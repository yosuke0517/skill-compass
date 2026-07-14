import { describe, expect, it } from "vitest";

import { createPodcastContextCollector } from "@/lib/podcast/context-collector";

const item = { id: "calendar:1", title: "09:00 standup", url: "calendar://primary", collectedAt: "2026-07-14T00:00:00.000Z" };

describe("podcast context collector", () => {
  it("only calls providers for enabled inputs", async () => {
    const calendar = { collect: async () => [item] };
    const xPublic = { collect: async () => [{ ...item, id: "x:1", title: "X post" }] };
    const collector = createPodcastContextCollector({ calendar, xPublic });

    await expect(collector.collect({ now: new Date(), includeCalendar: true, includeXPublic: false, includeXPersonal: false })).resolves.toEqual([item]);
    await expect(collector.collect({ now: new Date(), includeCalendar: false, includeXPublic: true, includeXPersonal: false })).resolves.toEqual([{ ...item, id: "x:1", title: "X post" }]);
  });

  it("skips unconfigured integrations without failing source generation", async () => {
    await expect(createPodcastContextCollector().collect({ now: new Date(), includeCalendar: true, includeXPublic: true, includeXPersonal: true })).resolves.toEqual([]);
  });
});
