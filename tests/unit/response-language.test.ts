import { describe, expect, it } from "vitest";

import { detectResponseLanguage } from "@/lib/language/detect-response-language";

describe("detectResponseLanguage", () => {
  it("uses Japanese when the latest message contains Japanese script", () => {
    expect(detectResponseLanguage("skill-compassのTodayやりたい")).toBe("ja");
  });

  it("defaults to English", () => {
    expect(detectResponseLanguage("Start today's quiz")).toBe("en");
    expect(detectResponseLanguage("123")).toBe("en");
  });
});
