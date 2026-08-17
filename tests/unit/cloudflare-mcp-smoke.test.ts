import { describe, expect, it, vi } from "vitest";

import { runMcpSmoke } from "../../scripts/cloudflare/mcp-smoke";

describe("Cloudflare MCP smoke", () => {
  it("checks metadata and the unauthenticated boundary without mutation", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ issuer: "https://staging.example" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }));

    await expect(runMcpSmoke({ baseUrl: "https://staging.example", fetchImpl })).resolves.toEqual({
      ok: true,
      checks: ["oauth_metadata", "mcp_unauthorized"],
      authenticated: false,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("initializes, lists allowlisted tools, and verifies an X Article with an ephemeral bearer", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ issuer: "https://staging.example" }), { status: 200 }))
      .mockResolvedValueOnce(new Response("unauthorized", { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: { serverInfo: { name: "skill-compass" } } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: { tools: [
        { name: "get_today" }, { name: "get_x_post" }, { name: "get_daily_tech_posts" }, { name: "list_podcast_episodes" },
      ] } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: { structuredContent: { post: { article: { plainText: "Article" } } } } }), { status: 200 }));

    const report = await runMcpSmoke({
      baseUrl: "https://staging.example",
      accessToken: "ephemeral-token",
      xPostUrl: "https://x.com/example/status/123",
      fetchImpl,
    });

    expect(report.checks).toContain("mcp_x_article");
    expect(JSON.stringify(report)).not.toContain("ephemeral-token");
  });
});
