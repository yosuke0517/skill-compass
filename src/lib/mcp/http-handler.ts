import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import type { CurrentUserAccess } from "@/lib/access/types";
import { getEnv } from "@/lib/env";
import {
  createSkillCompassMcpServer,
  type SkillCompassMcpServices,
} from "@/lib/mcp/server";

type McpHttpDeps = {
  resourceUrl: string;
  authenticate(authorization: string | null): Promise<CurrentUserAccess | null>;
  createServices(user: CurrentUserAccess): Promise<SkillCompassMcpServices>;
};

export async function handleMcpRequest(
  request: Request,
  deps: McpHttpDeps,
): Promise<Response> {
  if (requestOrigin(request) !== new URL(deps.resourceUrl).origin) {
    return Response.json({ error: "invalid_host" }, { status: 403 });
  }
  const user = await deps.authenticate(request.headers.get("authorization"));
  if (!user) {
    const metadata = new URL(
      "/.well-known/oauth-protected-resource/mcp",
      deps.resourceUrl,
    );
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: {
        "content-type": "application/json",
        "www-authenticate": `Bearer resource_metadata="${metadata.toString()}"`,
      },
    });
  }

  const server = createSkillCompassMcpServer({
    user,
    services: await deps.createServices(user),
  });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    await server.close();
  }
}

function requestOrigin(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwardedHost && (forwardedProto === "https" || forwardedProto === "http")) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  return new URL(request.url).origin;
}

export async function handleProductionMcpRequest(request: Request) {
  const env = getEnv();
  if (
    !env.MCP_RESOURCE_URL ||
    !env.MCP_ALLOWED_USER_ID ||
    !env.MCP_ISSUER_URL
  ) {
    return Response.json({ error: "mcp_not_configured" }, { status: 503 });
  }
  const allowedUserId = env.MCP_ALLOWED_USER_ID;
  const [
    { getCurrentUserById },
    { createDrizzleMcpAuthRepository },
    { authenticateMcpBearer },
    {
      askPodcastForUser,
      getPodcastEpisodeForUser,
      listPodcastEpisodesForUser,
    },
    { getTodayForUser, submitTodayForUser },
  ] = await Promise.all([
    import("@/lib/access/current-user"),
    import("@/lib/mcp/auth/repository"),
    import("@/lib/mcp/auth/service"),
    import("@/lib/podcast/podcast-service"),
    import("@/lib/quiz/today-service"),
  ]);
  return handleMcpRequest(request, {
    resourceUrl: env.MCP_RESOURCE_URL,
    async authenticate(authorization) {
      const userId = await authenticateMcpBearer(
        authorization,
        createDrizzleMcpAuthRepository(),
        { allowedUserId },
      );
      return userId ? getCurrentUserById(userId) : null;
    },
    async createServices(user) {
      return {
        async getToday() {
          return {
            ...(await getTodayForUser(
              { userId: user.id },
              { allowedUserId },
            )),
          };
        },
        async submitToday(input) {
          return {
            ...(await submitTodayForUser(
              { ...input, userId: user.id, today: new Date().toISOString().slice(0, 10) },
              { allowedUserId },
            )),
          };
        },
        async listEpisodes({ limit }) {
          return listPodcastEpisodesForUser(user, limit);
        },
        async getEpisode({ episodeId }) {
          return { ...(await getPodcastEpisodeForUser(user, episodeId)) };
        },
        async askPodcast({ episodeId, question }) {
          return { ...(await askPodcastForUser({ user, episodeId, question })) };
        },
      };
    },
  });
}
