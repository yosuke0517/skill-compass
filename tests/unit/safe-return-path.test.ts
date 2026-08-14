import { describe, expect, it } from "vitest";
import { safeReturnPath } from "@/lib/auth/safe-return-path";

describe("safeReturnPath", () => {
  it("preserves an internal path with its query string", () => {
    expect(safeReturnPath("/docs/cloud-migration?from=chat")).toBe(
      "/docs/cloud-migration?from=chat",
    );
  });

  it.each([
    ["external absolute URL", "https://evil.example"],
    ["protocol-relative URL", "//evil.example"],
    ["backslash path", "/\\evil"],
    ["control characters", "/dashboard\nset-cookie:evil"],
    ["invalid encoding", "/%E0%A4%A"],
    ["empty string", ""],
    ["null", null],
    ["undefined", undefined],
  ])("returns the dashboard for %s", (_description, value) => {
    expect(safeReturnPath(value)).toBe("/dashboard");
  });
});
