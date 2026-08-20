import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  batch: vi.fn(),
  insert: vi.fn(),
  transaction: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  db: mocks,
}));

import { createDrizzleMcpAuthRepository } from "@/lib/mcp/auth/repository";

describe("D1 MCP auth repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("claims an authorization code with one conditional update", async () => {
    const now = new Date("2026-08-20T14:00:00.000Z");
    const stored = {
      codeHash: "code-hash",
      clientId: "client-1",
      userId: "user-1",
      redirectUri: "https://chatgpt.com/oauth/callback",
      codeChallenge: "challenge",
      expiresAt: new Date("2026-08-20T14:10:00.000Z"),
      usedAt: null,
    };
    const returning = vi.fn().mockResolvedValue([stored]);
    const where = vi.fn(() => ({ returning }));
    const set = vi.fn(() => ({ where }));
    mocks.update.mockReturnValue({ set });

    const result = await createDrizzleMcpAuthRepository()
      .consumeAuthorizationCode("code-hash", now);

    expect(result).toEqual({ ...stored, usedAt: now });
    expect(mocks.update).toHaveBeenCalledOnce();
    expect(set).toHaveBeenCalledWith({ usedAt: now });
    expect(returning).toHaveBeenCalledOnce();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("stores an access and refresh token with one atomic D1 batch", async () => {
    const accessToken = {
      tokenHash: "access-hash",
      familyId: "family-1",
      clientId: "client-1",
      userId: "user-1",
      expiresAt: new Date("2026-08-20T15:00:00.000Z"),
      revokedAt: null,
    };
    const refreshToken = {
      tokenHash: "refresh-hash",
      familyId: "family-1",
      clientId: "client-1",
      userId: "user-1",
      familyExpiresAt: new Date("2027-02-20T14:00:00.000Z"),
      expiresAt: new Date("2027-02-20T14:00:00.000Z"),
      consumedAt: null,
      replacementTokenHash: null,
      revokedAt: null,
    };
    const accessStatement = { kind: "access" };
    const refreshStatement = { kind: "refresh" };
    mocks.insert
      .mockReturnValueOnce({ values: vi.fn(() => accessStatement) })
      .mockReturnValueOnce({ values: vi.fn(() => refreshStatement) });
    mocks.batch.mockResolvedValue([]);

    await createDrizzleMcpAuthRepository()
      .saveTokenPair(accessToken, refreshToken);

    expect(mocks.batch).toHaveBeenCalledWith([
      accessStatement,
      refreshStatement,
    ]);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rotates a refresh token with D1 batch instead of SQL transactions", async () => {
    const now = new Date("2026-08-20T14:00:00.000Z");
    const familyExpiresAt = new Date("2027-02-20T14:00:00.000Z");
    const stored = {
      tokenHash: "old-refresh-hash",
      familyId: "family-1",
      clientId: "client-1",
      userId: "user-1",
      familyExpiresAt,
      expiresAt: familyExpiresAt,
      consumedAt: null,
      replacementTokenHash: null,
      revokedAt: null,
    };
    const limit = vi.fn().mockResolvedValue([stored]);
    const selectWhere = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where: selectWhere }));
    Object.assign(mocks, { select: vi.fn(() => ({ from })) });

    const claimStatement = { kind: "claim" };
    const updateWhere = vi.fn(() => ({
      returning: vi.fn(() => claimStatement),
    }));
    mocks.update.mockReturnValue({
      set: vi.fn(() => ({ where: updateWhere })),
    });
    const accessStatement = { kind: "access" };
    const refreshStatement = { kind: "refresh" };
    mocks.insert
      .mockReturnValueOnce({ values: vi.fn(() => accessStatement) })
      .mockReturnValueOnce({ values: vi.fn(() => refreshStatement) });
    mocks.batch.mockResolvedValueOnce([[stored], [], []]);

    const result = await createDrizzleMcpAuthRepository().rotateRefreshToken({
      tokenHash: stored.tokenHash,
      clientId: stored.clientId,
      userId: stored.userId,
      now,
      newAccessTokenHash: "new-access-hash",
      newRefreshTokenHash: "new-refresh-hash",
      accessExpiresAt: new Date("2026-08-20T15:00:00.000Z"),
    });

    expect(result).toEqual({
      status: "rotated",
      familyId: stored.familyId,
      familyExpiresAt,
    });
    expect(mocks.batch).toHaveBeenCalledWith([
      claimStatement,
      accessStatement,
      refreshStatement,
    ]);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
