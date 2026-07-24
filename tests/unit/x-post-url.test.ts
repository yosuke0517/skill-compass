import { describe, expect, it } from "vitest";

import { parseXPostUrl } from "@/lib/x/post-url";

describe("parseXPostUrl", () => {
  it.each([
    "https://x.com/example/status/2079777959167340607?s=46&t=tracking",
    "https://www.x.com/example/status/2079777959167340607",
    "https://twitter.com/example/status/2079777959167340607",
    "https://www.twitter.com/example/status/2079777959167340607",
  ])("extracts a numeric Post ID from %s", (url) => {
    expect(parseXPostUrl(url)).toEqual({
      postId: "2079777959167340607",
      canonicalUrl: "https://x.com/i/status/2079777959167340607",
    });
  });

  it.each([
    "http://x.com/example/status/1",
    "https://evil.example/example/status/1",
    "https://user:pass@x.com/example/status/1",
    "https://x.com:444/example/status/1",
    "https://x.com/example/status/not-a-number",
    "https://x.com/example/status/1/extra",
    "https://x.com/example/status/1#fragment",
  ])("rejects unsafe or unsupported URLs: %s", (url) => {
    expect(() => parseXPostUrl(url)).toThrow("invalid_x_post_url");
  });
});
