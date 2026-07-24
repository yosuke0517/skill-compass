import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  answerTechnicalInterviewQuestion,
  explainSecurityAndPrivacy,
  getArchitectureOverview,
} from "@/lib/mcp/architecture/answers";
import { architectureManifest } from "@/lib/mcp/architecture/manifest";
import {
  architectureTopics,
  interviewDepths,
  securityTopics,
} from "@/lib/mcp/architecture/types";

type JsonObject = Record<string, unknown>;

export function createArchitectureMcpServer() {
  const server = new McpServer(
    { name: "skill-compass-architecture", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  server.registerTool(
    "get_architecture_overview",
    {
      title: "Get Skill Compass architecture overview",
      description:
        "Get reviewed current facts about Skill Compass system design, components, deployment, or data flow.",
      inputSchema: {
        focus: z.enum(architectureTopics).default("system"),
        latestUserMessage: z.string().max(4000).optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ focus, latestUserMessage }) =>
      toolResult(
        getArchitectureOverview({
          manifest: architectureManifest,
          focus,
          latestUserMessage,
        }),
      ),
  );

  server.registerTool(
    "explain_security_and_privacy",
    {
      title: "Explain Skill Compass security and privacy",
      description:
        "Explain reviewed controls, limitations, residual risks, and clearly labeled planned improvements.",
      inputSchema: {
        topic: z.enum(securityTopics),
        latestUserMessage: z.string().max(4000).optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ topic, latestUserMessage }) =>
      toolResult(
        explainSecurityAndPrivacy({
          manifest: architectureManifest,
          topic,
          latestUserMessage,
        }),
      ),
  );

  server.registerTool(
    "answer_technical_interview_question",
    {
      title: "Answer a Skill Compass technical interview question",
      description:
        "Build a grounded interview answer that separates current implementation from planned improvements.",
      inputSchema: {
        question: z.string().trim().min(1).max(2000),
        depth: z.enum(interviewDepths).default("standard"),
        latestUserMessage: z.string().max(4000).optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ question, depth, latestUserMessage }) =>
      toolResult(
        answerTechnicalInterviewQuestion({
          manifest: architectureManifest,
          question,
          depth,
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
