import { describe, expect, it } from "vitest";

import { createRssNewsCollector } from "@/lib/podcast/news-collector";

describe("podcast RSS news collector", () => {
  it("normalizes RSS items into source snapshots", async () => {
    const collector = createRssNewsCollector({
      feedUrls: ["https://news.example/feed.xml"],
      fetch: async () => new Response(`<rss><channel><item><title><![CDATA[New API release]]></title><link>https://news.example/1</link><description>Useful &amp; notable.</description></item></channel></rss>`),
    });
    const [result] = await collector.collect({ enabled: true, now: new Date("2026-07-14T00:00:00.000Z") });
    expect(result).toMatchObject({ title: "New API release", url: "https://news.example/1", content: "Useful & notable.", collectedAt: "2026-07-14T00:00:00.000Z" });
    expect(result.id).toMatch(/^news:[a-f0-9]{16}$/);
  });

  it("does not fetch when news is disabled or feeds are not configured", async () => {
    let calls = 0;
    const collector = createRssNewsCollector({ feedUrls: [], fetch: async () => { calls += 1; return new Response(""); } });
    await expect(collector.collect({ enabled: true, now: new Date() })).resolves.toEqual([]);
    expect(calls).toBe(0);
  });
});
