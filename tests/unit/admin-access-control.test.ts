import { describe, expect, it } from "vitest";
import { buildAccessControlData } from "@/lib/admin/access-control";

describe("admin access read model", () => {
  it("combines plan defaults and user overrides for the selected user", () => {
    const data = buildAccessControlData({
      users: [
        { id: "u1", email: "admin@example.com", displayName: "Admin", role: "admin", plan: "pro", status: "active" },
        { id: "u2", email: "member@example.com", displayName: "Member", role: "normal", plan: "free", status: "active" },
      ],
      entitlements: [
        { id: "podcast.sample.view", description: "Sample" },
        { id: "podcast.generate", description: "Generate" },
      ],
      planDefaults: [{ planId: "free", entitlementId: "podcast.sample.view", enabled: true }],
      overrides: [{ userId: "u2", entitlementId: "podcast.generate", enabled: true }],
      auditLogs: [],
      selectedUserId: "u2",
    });

    expect(data.selectedUser?.email).toBe("member@example.com");
    expect(data.selectedUser?.capabilities).toEqual([
      { id: "podcast.sample.view", description: "Sample", source: "plan", enabled: true },
      { id: "podcast.generate", description: "Generate", source: "override_allow", enabled: true },
    ]);
  });
});
