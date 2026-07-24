import { describe, expect, it } from "vitest";

import { handleArchitectureMcpRequest } from "@/lib/mcp/architecture/http-handler";

const resourceUrl = "https://agent.finegate.xyz/mcp/architecture";

function initializeRequest(
  url = resourceUrl,
  headers: Record<string, string> = {},
) {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "test", version: "1.0.0" },
      },
    }),
  });
}

describe("Architecture MCP HTTP handler", () => {
  it("returns the Architecture protected-resource challenge when unauthenticated", async () => {
    const response = await handleArchitectureMcpRequest(initializeRequest(), {
      resourceUrl,
      authenticate: async () => false,
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      "https://agent.finegate.xyz/.well-known/oauth-protected-resource/mcp/architecture",
    );
  });

  it("trusts the configured forwarded public host", async () => {
    const response = await handleArchitectureMcpRequest(
      initializeRequest("http://localhost:3001/mcp/architecture", {
        "x-forwarded-host": "agent.finegate.xyz",
        "x-forwarded-proto": "https",
      }),
      {
        resourceUrl,
        authenticate: async () => false,
      },
    );

    expect(response.status).toBe(401);
  });

  it("rejects a mismatched host before authentication", async () => {
    let authenticationCalled = false;
    const response = await handleArchitectureMcpRequest(
      initializeRequest("https://attacker.example/mcp/architecture"),
      {
        resourceUrl,
        authenticate: async () => {
          authenticationCalled = true;
          return true;
        },
      },
    );

    expect(response.status).toBe(403);
    expect(authenticationCalled).toBe(false);
  });

  it("initializes the isolated Architecture server when authenticated", async () => {
    const response = await handleArchitectureMcpRequest(
      initializeRequest(resourceUrl, { authorization: "Bearer valid-token" }),
      {
        resourceUrl,
        authenticate: async (authorization) =>
          authorization === "Bearer valid-token",
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        serverInfo: { name: "skill-compass-architecture", version: "1.0.0" },
      },
    });
  });
});
