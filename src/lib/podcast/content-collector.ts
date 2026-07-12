export type PodcastSourceInput = {
  id: string;
  title: string;
  url: string;
  enabled: boolean;
};

export type CollectedSource = {
  id: string;
  title: string;
  url: string;
  collectedAt: string;
  content?: string;
};

export interface ContentCollector {
  collect(input: { sources: PodcastSourceInput[]; useSources: boolean }): Promise<CollectedSource[]>;
}

export function createDeterministicContentCollector(now = () => new Date()): ContentCollector {
  return {
    async collect(input) {
      if (!input.useSources) return [];
      const collectedAt = now().toISOString();
      return input.sources.filter((source) => source.enabled).map((source) => ({
        id: source.id,
        title: source.title,
        url: source.url,
        collectedAt,
      }));
    },
  };
}

export function createWebContentCollector(options: {
  now?: () => Date;
  fetch?: typeof fetch;
  maxCharsPerSource?: number;
} = {}): ContentCollector {
  const now = options.now ?? (() => new Date());
  const fetchSource = options.fetch ?? fetch;
  const maxChars = options.maxCharsPerSource ?? 12000;

  return {
    async collect(input) {
      if (!input.useSources) return [];
      const collectedAt = now().toISOString();
      const enabledSources = input.sources.filter((source) => source.enabled);
      return Promise.all(enabledSources.map(async (source) => {
        try {
          const response = await fetchSource(source.url, { headers: { accept: "text/html, text/plain" }, signal: AbortSignal.timeout(10000) });
          if (!response.ok) return { ...source, collectedAt };
          const body = await response.text();
          const content = extractReadableText(body).slice(0, maxChars);
          return content ? { ...source, collectedAt, content } : { ...source, collectedAt };
        } catch {
          return { ...source, collectedAt };
        }
      }));
    },
  };
}

function extractReadableText(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}
