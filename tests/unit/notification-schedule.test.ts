import { describe, expect, it } from "vitest";
import { nextNotificationAt, japanDate, isDueFresh } from "@/lib/notifications/schedule";
import { subscriptionSchema } from "@/lib/notifications/validation";

describe("Today reminder scheduling", () => {
  it("uses Japan time and schedules strictly after settings are saved", () => {
    expect(nextNotificationAt("09:00", new Date("2026-09-21T00:00:00Z"))).toBe(
      Date.parse("2026-09-22T00:00:00Z") / 1000,
    );
    expect(nextNotificationAt("09:00", new Date("2026-09-20T23:59:00Z"))).toBe(
      Date.parse("2026-09-21T00:00:00Z") / 1000,
    );
    expect(japanDate(new Date("2026-09-20T15:00:00Z"))).toBe("2026-09-21");
  });
  it("does not replay stale or future notifications", () => {
    expect(isDueFresh(1000, 1000)).toBe(true);
    expect(isDueFresh(1000, 1901)).toBe(false);
    expect(isDueFresh(1000, 999)).toBe(false);
  });
  it("rejects malformed times", () => {
    for (const time of ["24:00", "09:99", "9:00", "no"])
      expect(() => nextNotificationAt(time, new Date())).toThrow();
  });
});

describe("push destination validation", () => {
  const keys = { p256dh: "B" + "A".repeat(86), auth: "A".repeat(22) };
  it("accepts browser push services", () => {
    for (const host of [
      "fcm.googleapis.com",
      "web.push.apple.com",
      "updates.push.services.mozilla.com",
    ])
      expect(
        subscriptionSchema.safeParse({ endpoint: `https://${host}/push/id`, keys }).success,
      ).toBe(true);
  });
  it("rejects SSRF, credentials, alternate ports, lookalike hosts and invalid keys", () => {
    for (const endpoint of [
      "http://fcm.googleapis.com/push",
      "https://localhost/a",
      "https://127.0.0.1/a",
      "https://fcm.googleapis.com.evil.test/a",
      "https://user@web.push.apple.com/a",
      "https://web.push.apple.com:444/a",
      "https://web.push.apple.com/a#fragment",
    ])
      expect(subscriptionSchema.safeParse({ endpoint, keys }).success).toBe(false);
    expect(
      subscriptionSchema.safeParse({
        endpoint: "https://web.push.apple.com/a",
        keys: { p256dh: "bad", auth: "bad" },
      }).success,
    ).toBe(false);
  });
});
