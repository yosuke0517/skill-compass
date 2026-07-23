import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

import { createSkillCompassMcpServer } from "@/lib/mcp/server";

async function connectTestServer() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createSkillCompassMcpServer({
    user: {
      id: "user_1",
      email: "pro@example.com",
      displayName: "Pro",
      role: "normal",
      plan: "pro",
      entitlements: new Set(["podcast.chat", "podcast.generate"]),
    },
    services: {
      getToday: async () => ({
        quizDate: "2026-07-24",
        progress: { answered: 0, total: 5 },
        complete: false,
        nextQuestion: {
          quizDayId: "quiz_2026-07-24",
          questionId: "q1",
          slot: 1,
          prompt: "Question",
          choices: [{ id: "a", label: "Choice" }],
        },
      }),
      submitToday: async () => ({ feedback: "Saved" }),
      listEpisodes: async () => [],
      getEpisode: async () => ({ id: "episode_1" }),
      askPodcast: async () => ({ answer: "Answer", provider: "test" }),
    },
  });
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server };
}

describe("Skill Compass MCP tools", () => {
  it("publishes exactly five tools without a userId input", async () => {
    const { client, server } = await connectTestServer();
    const result = await client.listTools();
    const names = result.tools.map((tool) => tool.name).sort();

    expect(names).toEqual([
      "ask_about_podcast",
      "get_podcast_episode",
      "get_today",
      "list_podcast_episodes",
      "submit_today_answer",
    ]);
    expect(JSON.stringify(result.tools)).not.toContain("userId");
    await client.close();
    await server.close();
  });

  it("calls get_today and returns structured content", async () => {
    const { client, server } = await connectTestServer();
    const result = await client.callTool({ name: "get_today", arguments: {} });

    expect(result.structuredContent).toMatchObject({
      quizDate: "2026-07-24",
      complete: false,
      progress: { answered: 0, total: 5 },
    });
    await client.close();
    await server.close();
  });
});
