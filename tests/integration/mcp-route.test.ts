import { describe, expect, it } from "vitest";

import { handleMcpRequest } from "@/lib/mcp/http-handler";

const user = {
  id: "user_1",
  email: "pro@example.com",
  displayName: "Pro",
  role: "normal" as const,
  plan: "pro" as const,
  entitlements: new Set(["podcast.chat", "podcast.generate"] as const),
};

const services = {
  getToday: async () => ({
    quizDate: "2026-07-24",
    progress: { answered: 0, total: 5 },
    complete: false,
    nextQuestion: null,
  }),
  submitToday: async () => ({ feedback: "Saved" }),
  listEpisodes: async () => [],
  getEpisode: async () => ({ id: "episode_1" }),
  askPodcast: async () => ({ answer: "Answer", provider: "test" }),
  getXPost: async () => ({ post: { id: "123" } }),
  getDailyTechPosts: async () => ({ posts: [] }),
};

describe("MCP HTTP handler", () => {
  it("returns a protected-resource challenge when bearer authentication is missing", async () => {
    const response = await handleMcpRequest(
      new Request("https://agent.finegate.xyz/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
      }),
      {
        resourceUrl: "https://agent.finegate.xyz/mcp",
        authenticate: async () => null,
        createServices: async () => services,
      },
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      "https://agent.finegate.xyz/.well-known/oauth-protected-resource/mcp",
    );
  });

  it("trusts the forwarded public host from the configured Cloudflare proxy", async () => {
    const response = await handleMcpRequest(
      new Request("http://localhost:3001/mcp", {
        method: "POST",
        headers: {
          host: "localhost:3001",
          "x-forwarded-host": "agent.finegate.xyz",
          "x-forwarded-proto": "https",
          "content-type": "application/json",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
      }),
      {
        resourceUrl: "https://agent.finegate.xyz/mcp",
        authenticate: async () => null,
        createServices: async () => services,
      },
    );

    expect(response.status).toBe(401);
  });

  it("initializes for an authenticated user", async () => {
    const response = await handleMcpRequest(
      new Request("https://agent.finegate.xyz/mcp", {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
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
      }),
      {
        resourceUrl: "https://agent.finegate.xyz/mcp",
        authenticate: async () => user,
        createServices: async () => services,
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: { serverInfo: { name: "skill-compass" } },
    });
  });
});
