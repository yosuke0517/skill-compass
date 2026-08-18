type RpcResponse = { error?: unknown; result?: Record<string, unknown> };

async function rpc(baseUrl: string, token: string, method: string, params: Record<string, unknown>, fetchImpl: typeof fetch) {
  const response = await fetchImpl(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) throw new Error(`mcp_smoke_failed:${method}:${response.status}`);
  const body = await response.json() as RpcResponse;
  if (body.error) throw new Error(`mcp_smoke_failed:${method}:rpc_error`);
  return body.result ?? {};
}

export async function runMcpSmoke(input: { baseUrl: string; accessToken?: string; xPostUrl?: string; fetchImpl?: typeof fetch }) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const metadataResponse = await fetchImpl(`${input.baseUrl}/.well-known/oauth-authorization-server`);
  if (!metadataResponse.ok) throw new Error(`oauth_metadata_failed:${metadataResponse.status}`);
  const metadata = await metadataResponse.json() as { issuer?: string };
  if (metadata.issuer !== input.baseUrl) throw new Error("oauth_metadata_issuer_mismatch");

  const unauthorized = await fetchImpl(`${input.baseUrl}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
  });
  if (unauthorized.status !== 401) throw new Error(`mcp_unauthorized_boundary_failed:${unauthorized.status}`);

  const checks = ["oauth_metadata", "mcp_unauthorized"];
  if (input.accessToken) {
    const initialized = await rpc(input.baseUrl, input.accessToken, "initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "skill-compass-staging-smoke", version: "1.0.0" },
    }, fetchImpl);
    if ((initialized.serverInfo as { name?: string } | undefined)?.name !== "skill-compass") throw new Error("mcp_initialize_identity_mismatch");
    const listed = await rpc(input.baseUrl, input.accessToken, "tools/list", {}, fetchImpl);
    const toolNames = ((listed.tools ?? []) as Array<{ name?: string }>).map(({ name }) => name);
    for (const required of ["get_today", "get_x_post", "get_daily_tech_posts", "list_podcast_episodes"]) {
      if (!toolNames.includes(required)) throw new Error(`mcp_tool_missing:${required}`);
    }
    checks.push("mcp_initialize", "mcp_tools_list");

    if (input.xPostUrl) {
      const result = await rpc(input.baseUrl, input.accessToken, "tools/call", {
        name: "get_x_post",
        arguments: { url: input.xPostUrl, latestUserMessage: "この記事を確認して" },
      }, fetchImpl);
      const structured = result.structuredContent as { post?: { article?: { plainText?: string } } } | undefined;
      if (!structured?.post?.article?.plainText) throw new Error("mcp_x_article_missing");
      checks.push("mcp_x_article");
    }
  }
  return { ok: true, checks, authenticated: Boolean(input.accessToken) };
}

async function main() {
  const baseUrl = process.env.STAGING_BASE_URL;
  if (!baseUrl) throw new Error("STAGING_BASE_URL is required");
  const report = await runMcpSmoke({
    baseUrl: baseUrl.replace(/\/$/, ""),
    accessToken: process.env.STAGING_MCP_ACCESS_TOKEN,
    xPostUrl: process.env.STAGING_X_ARTICLE_URL,
  });
  console.log(JSON.stringify(report));
}

if (process.argv[1]?.endsWith("mcp-smoke.ts")) main().catch((error) => { console.error(error instanceof Error ? error.message : "mcp_smoke_failed"); process.exitCode = 1; });
