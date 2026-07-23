import { describe, expect, it } from "vitest";

import {
  authorizationServerMetadata,
  protectedResourceMetadata,
  validateRedirectUri,
} from "@/lib/mcp/auth/http";

describe("MCP OAuth HTTP metadata", () => {
  it("publishes the protected resource and authorization endpoints", () => {
    expect(
      protectedResourceMetadata(
        "https://agent.finegate.xyz",
        "https://agent.finegate.xyz/mcp",
      ),
    ).toEqual({
      resource: "https://agent.finegate.xyz/mcp",
      authorization_servers: ["https://agent.finegate.xyz"],
      bearer_methods_supported: ["header"],
    });

    expect(authorizationServerMetadata("https://agent.finegate.xyz")).toMatchObject({
      issuer: "https://agent.finegate.xyz",
      authorization_endpoint: "https://agent.finegate.xyz/oauth/authorize",
      token_endpoint: "https://agent.finegate.xyz/oauth/token",
      registration_endpoint: "https://agent.finegate.xyz/oauth/register",
      code_challenge_methods_supported: ["S256"],
    });
  });

  it("accepts HTTPS and loopback HTTP redirect URIs only", () => {
    expect(validateRedirectUri("https://chatgpt.com/oauth/callback")).toBe(
      "https://chatgpt.com/oauth/callback",
    );
    expect(validateRedirectUri("http://127.0.0.1:4321/callback")).toBe(
      "http://127.0.0.1:4321/callback",
    );
    expect(() => validateRedirectUri("http://example.com/callback")).toThrow(
      "invalid_redirect_uri",
    );
    expect(() => validateRedirectUri("javascript:alert(1)")).toThrow(
      "invalid_redirect_uri",
    );
  });
});
