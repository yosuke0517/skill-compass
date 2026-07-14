import type { CollectedSource } from "@/lib/podcast/content-collector";

export type PodcastContextInput = {
  now: Date;
  includeCalendar: boolean;
  includeXPublic: boolean;
  includeXPersonal: boolean;
};

export interface PodcastContextProvider {
  collect(input: PodcastContextInput): Promise<CollectedSource[]>;
}

export type PodcastContextProviders = {
  calendar?: PodcastContextProvider;
  xPublic?: PodcastContextProvider;
  xPersonal?: PodcastContextProvider;
};

export function createPodcastContextCollector(providers: PodcastContextProviders = {}): PodcastContextProvider {
  return {
    async collect(input) {
      const tasks: Array<Promise<CollectedSource[]>> = [];
      if (input.includeCalendar && providers.calendar) tasks.push(providers.calendar.collect(input));
      if (input.includeXPublic && providers.xPublic) tasks.push(providers.xPublic.collect(input));
      if (input.includeXPersonal && providers.xPersonal) tasks.push(providers.xPersonal.collect(input));
      const results = await Promise.all(tasks);
      return results.flat();
    },
  };
}
