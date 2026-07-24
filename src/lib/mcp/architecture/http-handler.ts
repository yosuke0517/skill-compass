import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { getEnv } from "@/lib/env";
import { createArchitectureMcpServer } from "@/lib/mcp/architecture/server";

type McpArchitectureHttpDeps = {
  resourceUrl: string;
  authenticate(authorization: string | null): Promise<boolean>;
};

export async function handleArchitectureMcpRequest(
  request: Request,
  deps: McpArchitectureHttpDeps,
): Promise<Response> {
  if (requestOrigin(request) !== new URL(deps.resourceUrl).origin) {
    return Response.json({ error: "invalid_host" }, { status: 403 });
  }
  if (!(await deps.authenticate(request.headers.get("authorization")))) {
    const metadata = new URL(
      "/.well-known/oauth-protected-resource/mcp/architecture",
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

  const server = createArchitectureMcpServer();
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
  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  if (
    forwardedHost &&
    (forwardedProto === "https" || forwardedProto === "http")
  ) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  return new URL(request.url).origin;
}

export async function handleProductionArchitectureMcpRequest(request: Request) {
  const env = getEnv();
  if (
    !env.MCP_ARCHITECTURE_RESOURCE_URL ||
    !env.MCP_ALLOWED_USER_ID ||
    !env.MCP_ISSUER_URL
  ) {
    return Response.json({ error: "mcp_not_configured" }, { status: 503 });
  }
  const allowedUserId = env.MCP_ALLOWED_USER_ID;
  const resourceUrl = env.MCP_ARCHITECTURE_RESOURCE_URL;
  const [{ getCurrentUserById }, { createDrizzleMcpAuthRepository }, { authenticateMcpBearer }] =
    await Promise.all([
      import("@/lib/access/current-user"),
      import("@/lib/mcp/auth/repository"),
      import("@/lib/mcp/auth/service"),
    ]);

  return handleArchitectureMcpRequest(request, {
    resourceUrl,
    async authenticate(authorization) {
      const userId = await authenticateMcpBearer(
        authorization,
        createDrizzleMcpAuthRepository(),
        { allowedUserId },
      );
      return userId ? Boolean(await getCurrentUserById(userId)) : false;
    },
  });
}
