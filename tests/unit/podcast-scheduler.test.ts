import { describe, expect, it } from "vitest";

import { isPodcastGenerationDue, isPodcastSourceDue, localDateKey } from "@/lib/podcast/scheduler";

describe("podcast scheduler", () => {
  it("respects manual, daily, weekday, and weekly cadence", () => {
    expect(isPodcastGenerationDue("manual", "2026-07-14")).toBe(false);
    expect(isPodcastGenerationDue("daily", "2026-07-14", "2026-07-13")).toBe(true);
    expect(isPodcastGenerationDue("daily", "2026-07-14", "2026-07-14")).toBe(false);
    expect(isPodcastGenerationDue("weekdays", "2026-07-12")).toBe(false);
    expect(isPodcastGenerationDue("weekdays", "2026-07-13")).toBe(true);
    expect(isPodcastGenerationDue("weekly", "2026-07-14", "2026-07-08")).toBe(false);
    expect(isPodcastGenerationDue("weekly", "2026-07-15", "2026-07-08")).toBe(true);
  });

  it("derives a stable local date for the configured timezone", () => {
    expect(localDateKey(new Date("2026-07-13T15:30:00.000Z"), "Asia/Tokyo")).toBe("2026-07-14");
  });

  it("respects per-source collection cadence", () => {
    expect(isPodcastSourceDue("daily", "2026-07-14", "2026-07-13")).toBe(true);
    expect(isPodcastSourceDue("every_3_days", "2026-07-14", "2026-07-12")).toBe(false);
    expect(isPodcastSourceDue("every_3_days", "2026-07-15", "2026-07-12")).toBe(true);
    expect(isPodcastSourceDue("monthly", "2026-08-01", "2026-07-31")).toBe(true);
    expect(isPodcastSourceDue("monthly", "2026-07-31", "2026-07-01")).toBe(false);
  });
});
