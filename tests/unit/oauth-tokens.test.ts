import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  insertValues: vi.fn(),
  conflictUpdate: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  db: {
    insert: vi.fn(() => ({
      values: (values: unknown) => {
        mocks.insertValues(values);
        return {
          onConflictDoUpdate: (config: unknown) => {
            mocks.conflictUpdate(config);
            return Promise.resolve();
          },
        };
      },
    })),
  },
}));

vi.mock("@/lib/env", () => ({
  getEnv: () => ({ SESSION_SECRET: "test-session-secret-at-least-32-characters" }),
}));

import { saveOAuthToken } from "@/lib/integrations/oauth-tokens";

describe("saveOAuthToken", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-05T06:00:00.000Z"));
    mocks.insertValues.mockClear();
    mocks.conflictUpdate.mockClear();
  });

  it("records the current time for new and refreshed OAuth tokens", async () => {
    const now = new Date("2026-09-05T06:00:00.000Z");

    await saveOAuthToken("user-1", "x", {
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresInSeconds: 7200,
    });

    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ updatedAt: now }),
    );
    expect(mocks.conflictUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({ updatedAt: now }),
      }),
    );
  });
});
