import { describe, expect, it, vi } from "vitest";

import { runXPreflight } from "@/lib/x/preflight";

describe("runXPreflight", () => {
  it("ensures a current access token without making a data API request", async () => {
    const getAccessToken = vi.fn().mockResolvedValue("fresh-access");

    await expect(
      runXPreflight("skill-compass-user-1", {
        getAccessToken,
      }),
    ).resolves.toEqual({ status: "ready" });

    expect(getAccessToken).toHaveBeenCalledWith("skill-compass-user-1");
  });
});
