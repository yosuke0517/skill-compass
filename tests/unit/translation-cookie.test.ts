import { describe, expect, it, vi } from "vitest";

import { getTranslatedQuizCards } from "@/app/actions/translation";

const mockCookieValue = vi.hoisted(() => ({ value: null as string | null }));

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ get: () => mockCookieValue }),
}));

describe("getTranslatedQuizCards", () => {
  it("returns {} for malformed JSON", async () => {
    mockCookieValue.value = "{\"questionId\": ";
    expect(await getTranslatedQuizCards()).toEqual({});
  });

  it("returns {} for non-object cookie payloads", async () => {
    mockCookieValue.value = "[]";
    expect(await getTranslatedQuizCards()).toEqual({});

    mockCookieValue.value = '"not-an-object"';
    expect(await getTranslatedQuizCards()).toEqual({});

    mockCookieValue.value = "123";
    expect(await getTranslatedQuizCards()).toEqual({});
  });

  it("returns only valid translations and drops malformed entries", async () => {
    mockCookieValue.value = JSON.stringify({
      q1: {
        questionId: "q1",
        prompt: "Prompt one",
        feedback: "Feedback",
        unavailable: false,
        choices: [
          { id: "a", label: "Choice A" },
          { id: "b", label: null },
        ],
      },
      q2: {
        questionId: "q2",
        prompt: "Invalid choices",
        feedback: null,
        unavailable: false,
        choices: "not-an-array",
      },
      q3: {
        questionId: "q3",
        prompt: "Invalid missing key",
        unavailable: false,
        choices: [{ id: "a", label: "Choice A" }],
      },
    });

    expect(await getTranslatedQuizCards()).toEqual({
      q1: {
        questionId: "q1",
        prompt: "Prompt one",
        feedback: "Feedback",
        unavailable: false,
        choices: [
          { id: "a", label: "Choice A" },
          { id: "b", label: null },
        ],
      },
    });
  });

  it("normalizes questionId to the cookie object key", async () => {
    mockCookieValue.value = JSON.stringify({
      q_stored: {
        prompt: "Prompt",
        feedback: null,
        unavailable: false,
        choices: [{ id: "a", label: "Choice" }],
      },
    });

    expect(await getTranslatedQuizCards()).toEqual({
      q_stored: {
        questionId: "q_stored",
        prompt: "Prompt",
        feedback: null,
        unavailable: false,
        choices: [{ id: "a", label: "Choice" }],
      },
    });
  });
});
