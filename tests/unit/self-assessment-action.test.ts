import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  redirect: vi.fn((path: string): never => {
    throw new Error(`redirect:${path}`);
  }),
  requireCurrentUser: vi.fn(),
  values: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/access/current-user", () => ({ requireCurrentUser: mocks.requireCurrentUser }));
vi.mock("@/db/client", () => ({
  db: {
    insert: mocks.insert,
  },
}));

import { saveSelfAssessmentAction } from "@/app/actions/self-assessments";

describe("saveSelfAssessmentAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentUser.mockResolvedValue({ id: "user_a" });
    mocks.values.mockResolvedValue(undefined);
    mocks.insert.mockReturnValue({ values: mocks.values });
  });

  it("writes the authenticated owner and ignores a forged FormData userId", async () => {
    const formData = new FormData();
    formData.set("subjectId", "cat_frontend");
    formData.set("rating", "0.8");
    formData.set("userId", "user_b");

    await expect(saveSelfAssessmentAction(formData)).rejects.toThrow("redirect:/skills");

    expect(mocks.requireCurrentUser).toHaveBeenCalledOnce();
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_a",
        subjectType: "category",
        subjectId: "cat_frontend",
        rating: 0.8,
      }),
    );
    expect(mocks.values).not.toHaveBeenCalledWith(expect.objectContaining({ userId: "user_b" }));
  });
});
