import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";

import { createSkillCompassMcpServer } from "@/lib/mcp/server";

async function connectTestServer() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const getXPost = vi.fn().mockResolvedValue({
    post: { id: "123", text: "An X post" },
    unavailableReferences: [],
  });
  const getDailyTechPosts = vi.fn().mockResolvedValue({
    posts: [],
    partialFailures: [],
  });
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
      getXPost,
      getDailyTechPosts,
    },
  });
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server, getXPost, getDailyTechPosts };
}

describe("Skill Compass MCP tools", () => {
  it("publishes exactly seven tools without user IDs or token inputs", async () => {
    const { client, server } = await connectTestServer();
    const result = await client.listTools();
    const names = result.tools.map((tool) => tool.name).sort();

    expect(names).toEqual([
      "ask_about_podcast",
      "get_daily_tech_posts",
      "get_podcast_episode",
      "get_today",
      "get_x_post",
      "list_podcast_episodes",
      "submit_today_answer",
    ]);
    expect(JSON.stringify(result.tools)).not.toContain("userId");
    expect(JSON.stringify(result.tools).toLowerCase()).not.toContain("token");
    await client.close();
    await server.close();
  });

  it("routes an X share URL and detects Japanese", async () => {
    const { client, server, getXPost } = await connectTestServer();
    const result = await client.callTool({
      name: "get_x_post",
      arguments: {
        url: "https://x.com/alice/status/123?s=46",
        latestUserMessage: "これどういう意味？",
      },
    });

    expect(getXPost).toHaveBeenCalledWith({
      url: "https://x.com/alice/status/123?s=46",
    });
    expect(result.structuredContent).toMatchObject({
      post: { id: "123" },
      responseLanguage: "ja",
    });
    await client.close();
    await server.close();
  });

  it("defaults the daily technical digest to five items", async () => {
    const { client, server, getDailyTechPosts } = await connectTestServer();
    await client.callTool({
      name: "get_daily_tech_posts",
      arguments: { latestUserMessage: "今日の技術ニュース" },
    });

    expect(getDailyTechPosts).toHaveBeenCalledWith({
      limit: 5,
      latestUserMessage: "今日の技術ニュース",
    });
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
