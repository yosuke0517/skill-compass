import { describe, expect, it } from "vitest";

import {
  DEFAULT_SKILL_COMPASS_TIME_ZONE,
  localDateKey,
} from "@/lib/datetime/local-date";

describe("localDateKey", () => {
  it("uses the configured Skill Compass day instead of the host or UTC day", () => {
    const boundary = new Date("2026-07-27T15:30:00.000Z");

    expect(DEFAULT_SKILL_COMPASS_TIME_ZONE).toBe("Asia/Tokyo");
    expect(localDateKey(boundary)).toBe("2026-07-28");
    expect(localDateKey(boundary, "UTC")).toBe("2026-07-27");
  });
});
