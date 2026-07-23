import { pathToFileURL } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export function formatSmokeSummary(input: {
  serverName: string;
  tools: string[];
  today: unknown;
}): string {
  return [
    `Server: ${input.serverName}`,
    `Tools: ${input.tools.join(", ")}`,
    `Today: ${JSON.stringify(input.today)}`,
  ].join("\n");
}

export async function runMcpSmoke(endpoint: string, token: string): Promise<string> {
  const client = new Client({ name: "skill-compass-smoke", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
    requestInit: { headers: { authorization: `Bearer ${token}` } },
  });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    const today = await client.callTool({ name: "get_today", arguments: {} });
    return formatSmokeSummary({
      serverName: client.getServerVersion()?.name ?? "unknown",
      tools: tools.tools.map((tool) => tool.name).sort(),
      today: today.structuredContent ?? today.content,
    });
  } finally {
    await client.close();
  }
}

async function main() {
  const endpoint = process.argv[2] ?? "http://localhost:3001/mcp";
  const token = process.env.SKILL_COMPASS_MCP_TOKEN;
  if (!token) throw new Error("SKILL_COMPASS_MCP_TOKEN is required");
  process.stdout.write(`${await runMcpSmoke(endpoint, token)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "MCP smoke failed"}\n`);
    process.exitCode = 1;
  });
}
