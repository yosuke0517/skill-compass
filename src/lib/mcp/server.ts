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
    confidence: number;
    reasoning: string;
  }): Promise<JsonObject>;
  listEpisodes(input: { limit: number }): Promise<unknown[]>;
  getEpisode(input: { episodeId: string }): Promise<JsonObject>;
  askPodcast(input: { episodeId: string; question: string }): Promise<JsonObject>;
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
        "Get progress and the next unanswered Skill Compass Today question. Present one question at a time and never infer a hidden answer.",
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
        "Submit an answer only after collecting the choice, confidence from 1 to 5, and reasoning. This updates the shared Skill Compass learning state.",
      inputSchema: {
        quizDayId: z.string().min(1),
        questionId: z.string().min(1),
        selectedChoiceId: z.string().min(1),
        confidence: z.number().int().min(1).max(5),
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
        confidence,
        reasoning,
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

  return server;
}

function toolResult(value: JsonObject) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    structuredContent: value,
  };
}
