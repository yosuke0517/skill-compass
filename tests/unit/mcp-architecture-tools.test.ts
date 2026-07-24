import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

import { createArchitectureMcpServer } from "@/lib/mcp/architecture/server";

async function connectTestServer() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createArchitectureMcpServer();
  const client = new Client({
    name: "architecture-test-client",
    version: "1.0.0",
  });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server };
}

describe("Skill Compass Architecture MCP tools", () => {
  it("publishes exactly three read-only tools without retrieval inputs", async () => {
    const { client, server } = await connectTestServer();
    const result = await client.listTools();

    expect(result.tools.map((tool) => tool.name).sort()).toEqual([
      "answer_technical_interview_question",
      "explain_security_and_privacy",
      "get_architecture_overview",
    ]);
    expect(
      result.tools.every((tool) => tool.annotations?.readOnlyHint === true),
    ).toBe(true);
    expect(
      result.tools.every((tool) => tool.annotations?.destructiveHint === false),
    ).toBe(true);

    const serialized = JSON.stringify(result.tools);
    for (const forbidden of ["userId", "filePath", "url", "sql", "command"]) {
      expect(serialized).not.toContain(forbidden);
    }

    await client.close();
    await server.close();
  });

  it("returns structured architecture and interview answers", async () => {
    const { client, server } = await connectTestServer();

    const overview = await client.callTool({
      name: "get_architecture_overview",
      arguments: { focus: "components", latestUserMessage: "構成を教えて" },
    });
    expect(overview.structuredContent).toMatchObject({
      focus: "components",
      responseLanguage: "ja",
    });

    const security = await client.callTool({
      name: "explain_security_and_privacy",
      arguments: { topic: "mcp" },
    });
    expect(security.structuredContent).toMatchObject({
      topic: "mcp",
      responseLanguage: "en",
    });

    const interview = await client.callTool({
      name: "answer_technical_interview_question",
      arguments: {
        question: "How is MCP authentication secured?",
        depth: "brief",
      },
    });
    expect(interview.structuredContent).toMatchObject({
      responseLanguage: "en",
    });

    await client.close();
    await server.close();
  });

  it("rejects unsupported enum values", async () => {
    const { client, server } = await connectTestServer();

    const invalidTopic = await client.callTool({
      name: "explain_security_and_privacy",
      arguments: { topic: "database" },
    });
    const invalidDepth = await client.callTool({
      name: "answer_technical_interview_question",
      arguments: { question: "Explain it", depth: "unbounded" },
    });
    expect(invalidTopic.isError).toBe(true);
    expect(invalidDepth.isError).toBe(true);

    await client.close();
    await server.close();
  });
});
