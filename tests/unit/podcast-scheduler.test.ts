import { describe, expect, it } from "vitest";

import { isPodcastGenerationDue, localDateKey } from "@/lib/podcast/scheduler";

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
});
