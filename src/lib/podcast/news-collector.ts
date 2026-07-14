import { createHash } from "node:crypto";

import type { CollectedSource } from "@/lib/podcast/content-collector";

export type NewsCollector = {
  collect(input: { now: Date; enabled: boolean }): Promise<CollectedSource[]>;
};

export function createRssNewsCollector(options: { feedUrls: string[]; fetch?: typeof fetch; maxItemsPerFeed?: number }): NewsCollector {
  const fetchFeed = options.fetch ?? fetch;
  const maxItems = options.maxItemsPerFeed ?? 5;
  return {
    async collect(input) {
      if (!input.enabled || options.feedUrls.length === 0) return [];
      const results = await Promise.all(options.feedUrls.map(async (url) => {
        try {
          const response = await fetchFeed(url, { headers: { accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" }, signal: AbortSignal.timeout(10000) });
          if (!response.ok) return [];
          return parseFeed(await response.text(), url, input.now, maxItems);
        } catch {
          return [];
        }
      }));
      return results.flat();
    },
  };
}

function parseFeed(xml: string, feedUrl: string, now: Date, maxItems: number): CollectedSource[] {
  const blocks = [...xml.matchAll(/<(?:item|entry)\b[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi)].slice(0, maxItems);
  return blocks.flatMap((match) => {
    const block = match[1];
    const title = cleanXmlText(readTag(block, "title"));
    const link = readLink(block) || feedUrl;
    if (!title) return [];
    const description = cleanXmlText(readTag(block, "description") || readTag(block, "summary") || readTag(block, "content"));
    const id = `news:${createHash("sha256").update(`${feedUrl}:${link}:${title}`).digest("hex").slice(0, 16)}`;
    return [{ id, title, url: link, collectedAt: now.toISOString(), content: description || undefined }];
  });
}

function readTag(input: string, tag: string): string | undefined {
  return input.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1];
}

function readLink(input: string): string | undefined {
  return input.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?\s*>/i)?.[1] ?? readTag(input, "link")?.trim();
}

function cleanXmlText(input: string | undefined): string {
  return (input ?? "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/\s+/g, " ").trim();
}
