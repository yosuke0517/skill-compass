import { describe, expect, it } from "vitest";

import {
  MaintenanceReadOnlyError,
  assertWritesAllowed,
  resolveMaintenanceMode,
} from "@/lib/runtime/maintenance";

describe("maintenance mode", () => {
  it("defaults to normal operation when the setting is absent", () => {
    expect(resolveMaintenanceMode(undefined)).toBe("off");
    expect(() => assertWritesAllowed("quiz.submit", "off")).not.toThrow();
  });

  it("blocks business-data mutations while read-only", () => {
    expect(() => assertWritesAllowed("quiz.submit", "read_only")).toThrow(
      MaintenanceReadOnlyError,
    );
  });

  it("returns a stable, public-safe error", () => {
    try {
      assertWritesAllowed("oauth.token.save", "read_only");
      throw new Error("expected maintenance error");
    } catch (error) {
      expect(error).toMatchObject({
        code: "maintenance_read_only",
        operation: "oauth.token.save",
        status: 503,
        message: "Skill Compass is temporarily read-only.",
      });
    }
  });
});
