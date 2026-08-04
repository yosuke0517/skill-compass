import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { CurrentUserAccess } from "@/lib/access/types";
import { detectResponseLanguage } from "@/lib/language/detect-response-language";

type JsonObject = Record<string, unknown>;

export type SkillCompassMcpServices = {
  getToday(): Promise<JsonObject>;
  submitToday(input: {
    quizDayId: string;
    questionId: string;
    selectedChoiceId: string;
    confidence?: number;
    reasoning: string;
  }): Promise<JsonObject>;
  listEpisodes(input: { limit: number }): Promise<unknown[]>;
  getEpisode(input: { episodeId: string }): Promise<JsonObject>;
  askPodcast(input: { episodeId: string; question: string }): Promise<JsonObject>;
  getXPost(input: { url: string }): Promise<JsonObject>;
  getDailyTechPosts(input: {
    limit: number;
    latestUserMessage?: string;
  }): Promise<JsonObject>;
};

export function createSkillCompassMcpServer(context: {
  user: CurrentUserAccess;
  services: SkillCompassMcpServices;
}) {
  const server = new McpServer(
    { name: "skill-compass", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  server.registerTool(
    "get_today",
    {
      title: "Get Skill Compass Today",
      description:
        "Get Today progress, a learner-safe next question with its scenario and artifacts, and complete instructor data for all five lessons. Scheduled preparation must call this tool exactly once and never call submit_today_answer. Keep answers and teaching fields private until the learner commits.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async () => toolResult(await context.services.getToday()),
  );

  server.registerTool(
    "submit_today_answer",
    {
      title: "Submit Skill Compass Today answer",
      description:
        "Submit an answer after collecting the choice and reasoning. Confidence from 1 to 5 is optional reflection metadata and is not required for a complete answer. Never use during scheduled preparation; use later for a complete learner answer or SYNC PACK item. This updates the shared Skill Compass learning state.",
      inputSchema: {
        quizDayId: z.string().min(1),
        questionId: z.string().min(1),
        selectedChoiceId: z.string().min(1),
        confidence: z.number().int().min(1).max(5).optional(),
        reasoning: z.string().trim().min(1).max(4000),
        latestUserMessage: z.string().max(4000).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({
      quizDayId,
      questionId,
      selectedChoiceId,
      confidence,
      reasoning,
      latestUserMessage,
    }) => {
      const result = await context.services.submitToday({
        quizDayId,
        questionId,
        selectedChoiceId,
        reasoning,
        ...(confidence === undefined ? {} : { confidence }),
      });
      return toolResult({
        ...result,
        responseLanguage: detectResponseLanguage(latestUserMessage ?? ""),
      });
    },
  );

  server.registerTool(
    "list_podcast_episodes",
    {
      title: "List Skill Compass Podcast episodes",
      description:
        "List recent Podcast episodes owned by the connected Skill Compass user.",
      inputSchema: { limit: z.number().int().min(1).max(20).default(10) },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ limit }) => toolResult({ episodes: await context.services.listEpisodes({ limit }) }),
  );

  server.registerTool(
    "get_podcast_episode",
    {
      title: "Get a Skill Compass Podcast episode",
      description:
        "Read an owned Podcast episode transcript and sources without returning audio storage internals.",
      inputSchema: { episodeId: z.string().min(1) },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ episodeId }) =>
      toolResult(await context.services.getEpisode({ episodeId })),
  );

  server.registerTool(
    "ask_about_podcast",
    {
      title: "Ask about a Skill Compass Podcast",
      description:
        "Ask a grounded question about an owned Podcast episode. The conversation is persisted in Skill Compass.",
      inputSchema: {
        episodeId: z.string().min(1),
        question: z.string().trim().min(1).max(4000),
        latestUserMessage: z.string().max(4000).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ episodeId, question, latestUserMessage }) => {
      const result = await context.services.askPodcast({ episodeId, question });
      return toolResult({
        ...result,
        responseLanguage: detectResponseLanguage(latestUserMessage ?? question),
      });
    },
  );

  server.registerTool(
    "get_x_post",
    {
      title: "Get and explain an X Post",
      description:
        "Use this read-only tool whenever the user includes an x.com or twitter.com Post URL and asks what it means, whether its claim is significant, or for context. Returns the public Post plus its quoted Post and direct parent when available. Explain in the user's language and distinguish Post claims from verified facts.",
      inputSchema: {
        url: z.string().url().max(2048),
        latestUserMessage: z.string().max(4000).optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ url, latestUserMessage }) =>
      toolResult({
        ...(await context.services.getXPost({ url })),
        responseLanguage: detectResponseLanguage(latestUserMessage ?? ""),
      }),
  );

  server.registerTool(
    "get_daily_tech_posts",
    {
      title: "Get today's technical Posts from X",
      description:
        "Get the cached daily Skill Compass technical digest. Personalized Trends signals guide bounded recent public X searches, with a fixed technical query as fallback. Use for today's technical news, AI, Web/backend/cloud, and security Posts. Treat uncorroborated Posts as claims and link the originals.",
      inputSchema: {
        limit: z.number().int().min(1).max(10).default(5),
        latestUserMessage: z.string().max(4000).optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ limit, latestUserMessage }) =>
      toolResult(
        await context.services.getDailyTechPosts({
          limit,
          latestUserMessage,
        }),
      ),
  );

  return server;
}

function toolResult(value: JsonObject) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    structuredContent: value,
  };
}
