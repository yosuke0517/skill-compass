export type PodcastSettings = {
  generationFrequency: "daily" | "weekdays" | "weekly" | "manual";
  timezone: string;
  durationMinutes: number;
  language: "ja" | "en";
  useSources: boolean;
  includeNews: boolean;
  includeCalendar: boolean;
  includeXPublic: boolean;
  includeXPersonal: boolean;
  calendarReadMode: "time_title";
};

export type PodcastSourceSetting = {
  id: string;
  title: string;
  url: string;
  official: boolean;
  enabled: boolean;
  frequency: "daily" | "every_3_days" | "weekly" | "every_14_days" | "monthly";
};
