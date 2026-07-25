import { describe, expect, it } from "vitest";

import { buildXAuthorizeUrl } from "@/lib/integrations/x-oauth";

describe("buildXAuthorizeUrl", () => {
  it("requests only the X scopes used by the application plus offline access", () => {
    const url = buildXAuthorizeUrl({
      clientId: "client-id",
      redirectUri: "https://example.com/x/callback",
      state: "state",
      challenge: "challenge",
    });

    expect(url.searchParams.get("scope")).toBe(
      "tweet.read users.read offline.access",
    );
  });
});
